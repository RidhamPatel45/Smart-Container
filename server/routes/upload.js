const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const File = require('../models/File');
const { auth } = require('../middleware/auth');
const { uploadToCloudinary } = require('../config/cloudinary');
const mlClient = require('../utils/mlClient');
const FormData = require('form-data');

const router = express.Router();

// Multer: store in memory (we'll upload to Cloudinary)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'), false);
    }
  },
});

/**
 * Parse CSV buffer and count rows.
 */
function countCsvRows(buffer) {
  return new Promise((resolve, reject) => {
    let count = 0;
    const stream = Readable.from(buffer);
    stream
      .pipe(csv())
      .on('data', () => count++)
      .on('end', () => resolve(count))
      .on('error', reject);
  });
}

// ── POST /api/uploads ─────────────────────────────────────────
router.post('/', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: 'No file uploaded' });
    }

    // 1) Count rows
    const totalRecords = await countCsvRows(req.file.buffer);

    // 2) Upload CSV to Cloudinary
    const cloudResult = await uploadToCloudinary(
      req.file.buffer,
      'smartcontainer/uploads',
      'raw'
    );

    // 3) Create File doc (uploaded_csv)
    const fileDoc = await File.create({
      employee_id: req.user._id,
      file: cloudResult.secure_url,
      fileType: 'uploaded_csv',
      originalName: req.file.originalname,
      totalRecords,
      processingStatus: 'processing',
    });

    // 4) Trigger ML pipeline in background (don't await)
    runMLPipeline(fileDoc._id, req.file.buffer, req.file.originalname, req.user._id)
      .catch(err => console.error('ML Pipeline error:', err));

    res.status(201).json({
      _id: fileDoc._id,
      file: fileDoc.file,
      fileType: fileDoc.fileType,
      originalName: fileDoc.originalName,
      totalRecords: fileDoc.totalRecords,
      processingStatus: fileDoc.processingStatus,
      upload_date: fileDoc.upload_date,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ detail: error.message || 'Upload failed' });
  }
});

/**
 * Run ML pipeline: send CSV to FastAPI, get results, upload results to Cloudinary.
 */
async function runMLPipeline(fileDocId, csvBuffer, originalName, employeeId) {
  try {
    // Send CSV to FastAPI ML service
    const form = new FormData();
    form.append('file', csvBuffer, {
      filename: originalName,
      contentType: 'text/csv',
    });

    const mlResponse = await mlClient.post('/api/ml/predict', form, {
      headers: form.getHeaders(),
      responseType: 'json',
      timeout: 600000, // 10 min timeout for very large files
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const results = mlResponse.data;
    const aiSummary = results.ai_summary || '';

    // Convert results to CSV string
    const { Parser } = require('json2csv');
    let resultsCsv;
    if (results.predictions && results.predictions.length > 0) {
      const fields = Object.keys(results.predictions[0]);
      const parser = new Parser({ fields });
      resultsCsv = parser.parse(results.predictions);
    } else {
      resultsCsv = 'No predictions generated';
    }

    // Upload results CSV to Cloudinary
    const resultBuffer = Buffer.from(resultsCsv, 'utf-8');
    const resultCloud = await uploadToCloudinary(
      resultBuffer,
      'smartcontainer/results',
      'raw'
    );

    // Save generated CSV file doc (with AI summary)
    await File.create({
      employee_id: employeeId,
      file: resultCloud.secure_url,
      fileType: 'generated_csv',
      originalName: `results_${originalName}`,
      totalRecords: results.predictions ? results.predictions.length : 0,
      processingStatus: 'completed',
      parentFile: fileDocId,
      aiSummary: aiSummary,
    });

    // Update original file status + store AI summary on it too
    await File.findByIdAndUpdate(fileDocId, {
      processingStatus: 'completed',
      aiSummary: aiSummary,
    });

    console.log(`✅ ML Pipeline completed for file ${fileDocId}`);
    if (aiSummary) {
      console.log(`📝 AI Summary generated (${aiSummary.length} chars)`);
    }
  } catch (error) {
    console.error(`❌ ML Pipeline failed for file ${fileDocId}:`, error.message);

    // If it was a timeout, try predictions-only endpoint (without AI summary)
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      console.log(`⏳ Retrying without AI summary for file ${fileDocId}...`);
      try {
        const retryForm = new FormData();
        retryForm.append('file', csvBuffer, {
          filename: originalName,
          contentType: 'text/csv',
        });

        const retryResponse = await mlClient.post('/api/ml/predict?skip_summary=true', retryForm, {
          headers: retryForm.getHeaders(),
          responseType: 'json',
          timeout: 600000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });

        const retryResults = retryResponse.data;

        const { Parser } = require('json2csv');
        let retryCsv;
        if (retryResults.predictions && retryResults.predictions.length > 0) {
          const fields = Object.keys(retryResults.predictions[0]);
          const parser = new Parser({ fields });
          retryCsv = parser.parse(retryResults.predictions);
        } else {
          retryCsv = 'No predictions generated';
        }

        const retryBuffer = Buffer.from(retryCsv, 'utf-8');
        const retryCloud = await uploadToCloudinary(
          retryBuffer,
          'smartcontainer/results',
          'raw'
        );

        await File.create({
          employee_id: employeeId,
          file: retryCloud.secure_url,
          fileType: 'generated_csv',
          originalName: `results_${originalName}`,
          totalRecords: retryResults.predictions ? retryResults.predictions.length : 0,
          processingStatus: 'completed',
          parentFile: fileDocId,
          aiSummary: retryResults.ai_summary || '',
        });

        await File.findByIdAndUpdate(fileDocId, {
          processingStatus: 'completed',
          aiSummary: retryResults.ai_summary || '',
        });

        console.log(`✅ Retry succeeded (without AI summary) for file ${fileDocId}`);
        return;
      } catch (retryError) {
        console.error(`❌ Retry also failed for file ${fileDocId}:`, retryError.message);
      }
    }

    await File.findByIdAndUpdate(fileDocId, {
      processingStatus: 'failed',
    });
  }
}

// ── GET /api/uploads/:id/status ───────────────────────────────
router.get('/:id/status', auth, async (req, res) => {
  try {
    const fileDoc = await File.findById(req.params.id);
    if (!fileDoc) {
      return res.status(404).json({ detail: 'File not found' });
    }
    res.json({
      _id: fileDoc._id,
      processingStatus: fileDoc.processingStatus,
      totalRecords: fileDoc.totalRecords,
    });
  } catch (error) {
    res.status(500).json({ detail: 'Server error' });
  }
});

module.exports = router;
