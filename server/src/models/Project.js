const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 180
  },
  projectCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    minlength: 2,
    maxlength: 40
  },
  description: { type: String, trim: true, default: '', maxlength: 5000 },

  // ✅ clientName required
  clientName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 180
  },

  // ✅ clientPhone required (10 digits)
  clientPhone: {
    type: String,
    required: true,
    trim: true,
    maxlength: 40,
    validate: {
      validator(v) {
        return /^\d{10}$/.test(String(v || '').replace(/\D/g, '').slice(-10));
      },
      message: 'Client phone must contain exactly 10 digits.'
    }
  },

  clientDetails: { type: String, trim: true, default: '', maxlength: 2000 },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    default: null,
    index: true
  },

  startDate: { type: Date, required: true },
  dueDate: { type: Date, required: true },

  status: {
    type: String,
    enum: ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
    default: 'PLANNING',
    index: true
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM'
  },

  // ✅ cost required (>= 0)
  cost: {
    type: Number,
    required: true,
    min: 0
  },

  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true, versionKey: false });

projectSchema.index(
  { branchId: 1, projectCode: 1 },
  { unique: true, partialFilterExpression: { projectCode: { $type: 'string' } } }
);
projectSchema.index({ branchId: 1, status: 1, dueDate: 1 });

module.exports = mongoose.model('Project', projectSchema);