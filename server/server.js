const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// ── Middleware ─────────────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/uploads', require('./routes/upload'));
app.use('/api/files', require('./routes/files'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/predictions', require('./routes/reports')); // Alias for compatibility

// ── Health Check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'SmartContainer Risk Engine (Express)' });
});

// ── Error Handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ detail: err.message || 'Internal server error' });
});

// ── Startup: Seed Default Admin ───────────────────────────────
const seedDefaults = async () => {
  const Employee = require('./models/Employee');
  const bcrypt = require('bcryptjs');

  try {
    const adminExists = await Employee.findOne({ email: 'admin@smartcontainer.com' });
    if (!adminExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);
      await Employee.create({
        employeename: 'Admin',
        email: 'admin@smartcontainer.com',
        password: hashedPassword,
        role: 'admin',
      });
      console.log('✅ Default admin seeded: admin@smartcontainer.com / admin123');
    }
  } catch (error) {
    console.error('Seed error:', error.message);
  }
};

// ── Start Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 Express server running on http://localhost:${PORT}`);
  await seedDefaults();
});
