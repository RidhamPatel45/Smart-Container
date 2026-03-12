const express = require('express');
const File = require('../models/File');
const DeleteRequest = require('../models/DeleteRequest');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/files ────────────────────────────────────────────
// Admin sees all files, employee sees own files
router.get('/', auth, async (req, res) => {
  try {
    const query = req.user.role === 'admin' ? {} : { employee_id: req.user._id };
    const files = await File.find(query)
      .populate('employee_id', 'employeename email')
      .populate('parentFile', 'originalName')
      .sort({ upload_date: -1 });

    res.json(files);
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

// ── GET /api/files/:id ────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const file = await File.findById(req.params.id)
      .populate('employee_id', 'employeename email')
      .populate('parentFile', 'originalName file');

    if (!file) {
      return res.status(404).json({ detail: 'File not found' });
    }

    res.json(file);
  } catch (error) {
    res.status(500).json({ detail: 'Server error' });
  }
});

// ── GET /api/files/by-parent/:parentId ────────────────────────
// Get generated files for a given uploaded CSV
router.get('/by-parent/:parentId', auth, async (req, res) => {
  try {
    const files = await File.find({ parentFile: req.params.parentId })
      .sort({ upload_date: -1 });
    res.json(files);
  } catch (error) {
    res.status(500).json({ detail: 'Server error' });
  }
});

// ── POST /api/files/:id/delete-request ────────────────────────
// Employee requests deletion (goes to admin for approval)
router.post('/:id/delete-request', auth, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ detail: 'File not found' });
    }

    // Check if employee owns the file (unless admin)
    if (req.user.role !== 'admin' && file.employee_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ detail: 'You can only request deletion of your own files' });
    }

    // Check if there's already a pending request
    const existing = await DeleteRequest.findOne({ file_id: file._id, status: 'pending' });
    if (existing) {
      return res.status(400).json({ detail: 'A delete request is already pending for this file' });
    }

    const deleteRequest = await DeleteRequest.create({
      file_id: file._id,
      requested_by: req.user._id,
    });

    res.json({ message: 'Delete request submitted for admin approval', request: deleteRequest });
  } catch (error) {
    console.error('Delete request error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

module.exports = router;
