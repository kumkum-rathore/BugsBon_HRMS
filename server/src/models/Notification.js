const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true
    },
    type: { type: String, enum: ['MEETING_REMINDER'], required: true },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meeting',
      required: true
    },
    title: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 500 },
    readAt: { type: Date, default: null }
  },
  { timestamps: true, versionKey: false }
);

schema.index({ userId: 1, type: 1, referenceId: 1 }, { unique: true });
schema.index({ userId: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', schema);
