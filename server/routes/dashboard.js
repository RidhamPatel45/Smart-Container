const express = require('express');
const axios = require('axios');
const csv = require('csv-parser');
const { Readable } = require('stream');
const File = require('../models/File');
const { auth } = require('../middleware/auth');

const router = express.Router();

/**
 * Fetch and parse CSV from a Cloudinary URL.
 */
async function fetchCsvData(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = Readable.from(buffer);
    stream
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

// ── GET /api/dashboard/summary/:fileId ────────────────────────
router.get('/summary/:fileId', auth, async (req, res) => {
  try {
    const uploadedFile = await File.findById(req.params.fileId);
    if (!uploadedFile) {
      return res.status(404).json({ detail: 'File not found' });
    }

    // Find the generated CSV (results)
    const generatedFile = await File.findOne({
      parentFile: uploadedFile._id,
      fileType: 'generated_csv',
    });

    if (!generatedFile || generatedFile.processingStatus !== 'completed') {
      return res.json({
        total_containers: uploadedFile.totalRecords,
        critical_count: 0,
        medium_risk_count: 0,
        low_risk_count: 0,
        avg_risk_score: 0,
        max_risk_score: 0,
        processing_status: uploadedFile.processingStatus,
      });
    }

    // Parse the results CSV from Cloudinary
    const rows = await fetchCsvData(generatedFile.file);

    const total = rows.length;
    let critical = 0, medium = 0, low = 0;
    let totalScore = 0, maxScore = 0;

    rows.forEach((row) => {
      const score = parseFloat(row.risk_score || row['Risk_%'] || 0);
      const level = (row.risk_level || row.Risk_Level || '').trim();

      if (level === 'Critical') critical++;
      else if (level === 'Medium') medium++;
      else low++;

      totalScore += score;
      if (score > maxScore) maxScore = score;
    });

    res.json({
      total_containers: total,
      critical_count: critical,
      medium_risk_count: medium,
      low_risk_count: low,
      avg_risk_score: total > 0 ? Math.round((totalScore / total) * 10) / 10 : 0,
      max_risk_score: maxScore,
      processing_status: 'completed',
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

// ── GET /api/dashboard/charts/:fileId ─────────────────────────
router.get('/charts/:fileId', auth, async (req, res) => {
  try {
    const uploadedFile = await File.findById(req.params.fileId);
    if (!uploadedFile) {
      return res.status(404).json({ detail: 'File not found' });
    }

    const generatedFile = await File.findOne({
      parentFile: uploadedFile._id,
      fileType: 'generated_csv',
    });

    if (!generatedFile) {
      return res.status(404).json({ detail: 'No results found' });
    }

    const rows = await fetchCsvData(generatedFile.file);

    // 1) Risk Distribution
    const riskCounts = {};
    rows.forEach((row) => {
      const level = (row.risk_level || row.Risk_Level || 'Low').trim();
      riskCounts[level] = (riskCounts[level] || 0) + 1;
    });

    // 2) Score Histogram
    const bins = {};
    rows.forEach((row) => {
      const score = parseFloat(row.risk_score || row['Risk_%'] || 0);
      const bucket = Math.floor(score / 10) * 10;
      const key = `${bucket}-${bucket + 10}`;
      bins[key] = (bins[key] || 0) + 1;
    });
    const sortedBins = Object.fromEntries(
      Object.entries(bins).sort(([a], [b]) => parseInt(a) - parseInt(b))
    );

    // 3) Top Origin Countries by Critical count
    const countryCritical = {};
    const countryTotal = {};
    rows.forEach((row) => {
      const country = row.origin_country || row.Origin_Country || '';
      if (country) {
        countryTotal[country] = (countryTotal[country] || 0) + 1;
        const level = (row.risk_level || row.Risk_Level || '').trim();
        if (level === 'Critical') {
          countryCritical[country] = (countryCritical[country] || 0) + 1;
        }
      }
    });
    const topCountries = Object.entries(countryCritical)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    // 4) Risk by Trade Regime
    const regimeData = {};
    rows.forEach((row) => {
      const regime = row.trade_regime || row.Trade_Regime || '';
      const level = (row.risk_level || row.Risk_Level || '').trim();
      const score = parseFloat(row.risk_score || row['Risk_%'] || 0);
      if (regime) {
        if (!regimeData[regime]) regimeData[regime] = { total: 0, critical: 0, scores: [] };
        regimeData[regime].total++;
        if (level === 'Critical') regimeData[regime].critical++;
        regimeData[regime].scores.push(score);
      }
    });
    const riskByTrade = {};
    for (const [regime, data] of Object.entries(regimeData)) {
      riskByTrade[regime] = {
        total: data.total,
        critical: data.critical,
        avg_score: Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 10) / 10,
      };
    }

    // 5) Top Risk Factors from explanation
    const factorCounts = {};
    rows.forEach((row) => {
      const explanation = row.explanation_summary || row.Explanation_Summary || '';
      const factors = explanation.match(/([a-z][a-z\s\-]+)\s*\(\d+%\)/gi);
      if (factors) {
        factors.forEach((f) => {
          const name = f.replace(/\s*\(\d+%\)/, '').trim();
          factorCounts[name] = (factorCounts[name] || 0) + 1;
        });
      }
    });
    const topFactors = Object.entries(factorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    res.json({
      risk_distribution: riskCounts,
      score_histogram: sortedBins,
      top_countries: {
        labels: topCountries.map(([k]) => k),
        critical: topCountries.map(([, v]) => v),
        total: topCountries.map(([k]) => countryTotal[k] || 0),
      },
      risk_by_trade_regime: riskByTrade,
      top_risk_factors: {
        labels: topFactors.map(([k]) => k),
        values: topFactors.map(([, v]) => v),
      },
    });
  } catch (error) {
    console.error('Dashboard charts error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

// ── GET /api/dashboard/global ─────────────────────────────────
router.get('/global', auth, async (req, res) => {
  try {
    const totalUploads = await File.countDocuments({ fileType: 'uploaded_csv' });
    const completedUploads = await File.countDocuments({
      fileType: 'uploaded_csv',
      processingStatus: 'completed',
    });

    // Get recent uploads
    const recent = await File.find({ fileType: 'uploaded_csv' })
      .populate('employee_id', 'employeename')
      .sort({ upload_date: -1 })
      .limit(5);

    const recentUploads = recent.map((u) => ({
      _id: u._id,
      originalName: u.originalName,
      totalRecords: u.totalRecords,
      processingStatus: u.processingStatus,
      uploader: u.employee_id ? u.employee_id.employeename : 'Unknown',
      upload_date: u.upload_date,
    }));

    res.json({
      total_uploads: totalUploads,
      completed_uploads: completedUploads,
      recent_uploads: recentUploads,
    });
  } catch (error) {
    console.error('Global analytics error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

module.exports = router;
