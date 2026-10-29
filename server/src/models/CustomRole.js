const mongoose = require('mongoose');

const customRoleSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
    index: true
  },
  // NEW: role kis department ke andar bana hai
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    default: null,
    index: true
  },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  permissions: [{ type: String }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isDelete: { type: Boolean, default: false },
  archivedAt: { type: Date, default: null }
}, { timestamps: true });

// Ek department ke andar same code dobara na bane
customRoleSchema.index(
  { branchId: 1, departmentId: 1, code: 1 },
  { unique: true, partialFilterExpression: { isDelete: { $ne: true } } }
);

module.exports = mongoose.model('CustomRole', customRoleSchema);