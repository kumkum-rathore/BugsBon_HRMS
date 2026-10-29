const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    time: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, default: null, index: true },
    reminderAt: { type: Date, required: true, index: true },
    mode: {
      type: String,
      enum: ['ONLINE', 'OFFLINE'],
      required: true,
      default: 'OFFLINE'
    },
    meetLink: { type: String, default: null, trim: true },
    location: { type: String, default: '', trim: true, maxlength: 300 },
    attendees: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reminderSentAt: { type: Date, default: null },
    emailSentAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null }
  },
  { timestamps: true, versionKey: false }
);

schema.index({ branchId: 1, date: 1, cancelledAt: 1 });
schema.index({ reminderSentAt: 1, reminderAt: 1, startsAt: 1 });

module.exports = mongoose.model('Meeting', schema);