const mongoose = require('mongoose');

const deleteRequestSchema = new mongoose.Schema(
  {
    file_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      required: true,
    },
    requested_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null,
    },
    reviewed_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DeleteRequest', deleteRequestSchema);
