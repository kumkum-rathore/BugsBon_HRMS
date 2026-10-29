const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true
    },
    category: {
      type: String,
      enum: ['IDENTITY', 'EDUCATION', 'EXPERIENCE', 'CONTRACT', 'PAYSLIP', 'PROJECT', 'OTHER'],
      default: 'OTHER'
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    fileName: { type: String, required: true, maxlength: 255 },

    // Cloudinary storage key in the form: "<publicId>|<resourceType>"
    // e.g. "hrms-private-documents/abc123|image" or "hrms-private-documents/abc123|raw"
    storageKey: { type: String, required: true, maxlength: 500 },

    // ✅ NEW (optional but recommended) — Cloudinary helpers
    publicId: { type: String, default: '', maxlength: 300 },   // e.g. "hrms-private-documents/abc123"
    fileUrl: { type: String, default: '', maxlength: 1000 },   // Cloudinary secure_url (may be signed/expiring)

    mimeType: { type: String, required: true, maxlength: 120 },
    size: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'REJECTED'],
      default: 'PENDING'
    },
    reviewNote: { type: String, default: '', maxlength: 1000 },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true, versionKey: false }
);

// Speeds up lookups used by upload.controller.resolvePrivateFile()
schema.index({ storageKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('EmployeeDocument', schema);