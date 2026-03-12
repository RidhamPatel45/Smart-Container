const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema(
  {
    employee_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    file: {
      type: String,
      required: [true, 'File URL is required'],
    },
    fileType: {
      type: String,
      enum: ['uploaded_csv', 'generated_csv', 'generated_report'],
      required: true,
    },
    upload_date: {
      type: Date,
      default: Date.now,
    },
    // Extra metadata (not in core schema, but useful)
    originalName: {
      type: String,
      default: '',
    },
    totalRecords: {
      type: Number,
      default: 0,
    },
    processingStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    // AI-generated summary report (from HuggingFace LLM)
    aiSummary: {
      type: String,
      default: '',
    },
    // Reference to the parent uploaded CSV (for generated files)
    parentFile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('File', fileSchema);
