const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    employeename: {
      type: String,
      required: [true, 'Employee name is required'],
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
    },
    role: {
      type: String,
      enum: ['admin', 'employee'],
      default: 'employee',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Employee', employeeSchema);
