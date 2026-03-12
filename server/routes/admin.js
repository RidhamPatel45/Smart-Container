const express = require('express');
const Employee = require('../models/Employee');
const File = require('../models/File');
const DeleteRequest = require('../models/DeleteRequest');
const { auth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/admin/employees ──────────────────────────────────
router.get('/employees', auth, requireAdmin, async (req, res) => {
  try {
    const employees = await Employee.find()
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(employees);
  } catch (error) {
    console.error('List employees error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

// ── DELETE /api/admin/employees/:id ───────────────────────────
router.delete('/employees/:id', auth, requireAdmin, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ detail: 'Employee not found' });
    }
    if (employee._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ detail: 'Cannot delete yourself' });
    }

    // Delete associated files
    await File.deleteMany({ employee_id: employee._id });
    await Employee.findByIdAndDelete(req.params.id);

    res.json({ message: 'Employee deleted' });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

// ── DELETE /api/admin/files/:id — Admin directly deletes a file ──
router.delete('/files/:id', auth, requireAdmin, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ detail: 'File not found' });
    }

    // Also delete child generated files if this is an uploaded CSV
    if (file.fileType === 'uploaded_csv') {
      await File.deleteMany({ parentFile: file._id });
    }

    // Also delete any pending delete requests for this file
    await DeleteRequest.deleteMany({ file_id: file._id });

    await File.findByIdAndDelete(req.params.id);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Admin delete file error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

// ── GET /api/admin/delete-requests — List pending delete requests ──
router.get('/delete-requests', auth, requireAdmin, async (req, res) => {
  try {
    const requests = await DeleteRequest.find({ status: 'pending' })
      .populate('file_id', 'originalName fileType totalRecords upload_date')
      .populate('requested_by', 'employeename email')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error('List delete requests error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

// ── PUT /api/admin/delete-requests/:id/approve ────────────────
router.put('/delete-requests/:id/approve', auth, requireAdmin, async (req, res) => {
  try {
    const request = await DeleteRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ detail: 'Delete request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ detail: 'Request already processed' });
    }

    // Delete the file and its children
    const file = await File.findById(request.file_id);
    if (file) {
      if (file.fileType === 'uploaded_csv') {
        await File.deleteMany({ parentFile: file._id });
      }
      await File.findByIdAndDelete(file._id);
    }

    request.status = 'approved';
    request.reviewed_by = req.user._id;
    request.reviewed_at = new Date();
    await request.save();

    res.json({ message: 'Delete request approved, file deleted' });
  } catch (error) {
    console.error('Approve delete request error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

// ── PUT /api/admin/delete-requests/:id/reject ─────────────────
router.put('/delete-requests/:id/reject', auth, requireAdmin, async (req, res) => {
  try {
    const request = await DeleteRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ detail: 'Delete request not found' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ detail: 'Request already processed' });
    }

    request.status = 'rejected';
    request.reviewed_by = req.user._id;
    request.reviewed_at = new Date();
    await request.save();

    res.json({ message: 'Delete request rejected' });
  } catch (error) {
    console.error('Reject delete request error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

module.exports = router;

