const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { sendSuccess, sendError } = require('../utils/apiResponse');

async function list(req, res) {
  if (!req.user.branchId)
    return sendSuccess(res, { message: 'Notifications loaded.', data: [] });

  const rows = await Notification.find({
    userId: req.user.id,
    branchId: req.user.branchId
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return sendSuccess(res, { message: 'Notifications loaded.', data: rows });
}

async function markRead(req, res) {
  if (!mongoose.isValidObjectId(req.params.id))
    return sendError(res, { statusCode: 404, message: 'Notification not found.', code: 'NOT_FOUND' });

  const row = await Notification.findOneAndUpdate(
    {
      _id: req.params.id,
      userId: req.user.id,
      branchId: req.user.branchId
    },
    { $set: { readAt: new Date() } },
    { new: true }
  );
  if (!row)
    return sendError(res, { statusCode: 404, message: 'Notification not found.', code: 'NOT_FOUND' });

  return sendSuccess(res, { message: 'Notification marked as read.', data: row });
}

module.exports = { list, markRead };
