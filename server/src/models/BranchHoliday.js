const mongoose = require('mongoose');

const branchHolidaySchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD (per-day record)
    title: { type: String, required: true, trim: true, maxlength: 120 },
    // optional: group ke liye same ID taaki multi-day holiday ko ek saath delete kar sako
    groupId: { type: mongoose.Schema.Types.ObjectId, index: true },
    startDate: { type: String }, // YYYY-MM-DD (range start, informational)
    endDate: { type: String },   // YYYY-MM-DD (range end, informational)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

branchHolidaySchema.index({ branchId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('BranchHoliday', branchHolidaySchema);