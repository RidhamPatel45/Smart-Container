const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Employee = require('../models/Employee');
const { auth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ detail: 'Email and password are required' });
    }

    const user = await Employee.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ detail: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ detail: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { sub: user._id, role: user.role, name: user.employeename },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      access_token: token,
      token_type: 'bearer',
      user: {
        _id: user._id,
        employeename: user.employeename,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

// ── POST /api/auth/register (admin only) ──────────────────────
router.post('/register', auth, requireAdmin, async (req, res) => {
  try {
    const { employeename, email, password, role } = req.body;

    if (!employeename || !email || !password) {
      return res.status(400).json({ detail: 'All fields are required' });
    }

    // Check duplicates
    const existingEmail = await Employee.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ detail: 'Email already registered' });
    }
    const existingName = await Employee.findOne({ employeename });
    if (existingName) {
      return res.status(400).json({ detail: 'Employee name already taken' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const employee = await Employee.create({
      employeename,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role || 'employee',
    });

    res.status(201).json({
      _id: employee._id,
      employeename: employee.employeename,
      email: employee.email,
      role: employee.role,
      createdAt: employee.createdAt,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  res.json({
    _id: req.user._id,
    employeename: req.user.employeename,
    email: req.user.email,
    role: req.user.role,
    createdAt: req.user.createdAt,
  });
});

module.exports = router;
