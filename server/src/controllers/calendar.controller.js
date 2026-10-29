const mongoose = require('mongoose');
const BranchHoliday = require('../models/BranchHoliday');
const Shift = require('../models/Shift');
const Meeting = require('../models/Meeting');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { hasPermission } = require('../utils/permissions');
const { sendMeetingInvitations } = require('../services/email.service');
const MAX_HOLIDAY_DAYS = 60; // safety cap
function isBranchAdmin(req) {
  return hasPermission(req.user, 'calendar.manage') && !!req.user.branchId;
}

function isValidDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value;
}

function enumerateDates(startKey, endKey) {
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ey, em, ed] = endKey.split('-').map(Number);
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  const out = [];
  while (cursor <= end && out.length <= MAX_HOLIDAY_DAYS) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

async function list(req, res) {
  if (!req.user.branchId)
    return sendError(res, {
      statusCode: 403,
      message: 'Calendar is available only to branch users.',
      code: 'BRANCH_ACCESS_DENIED'
    });
  if (!hasPermission(req.user, 'calendar.view') && !hasPermission(req.user, 'calendar.manage') && !hasPermission(req.user, 'employee.create'))
    return sendError(res, {
      statusCode: 403,
      message: 'You do not have permission to view the branch calendar.',
      code: 'FORBIDDEN'
    });

  const month = String(req.query.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    return sendError(res, {
      statusCode: 400,
      message: 'A valid calendar month (YYYY-MM) is required.',
      code: 'VALIDATION_ERROR'
    });

  const [holidays, shifts, employee, meetings] = await Promise.all([
    BranchHoliday.find({
      branchId: req.user.branchId,
      date: { $gte: `${month}-01`, $lte: `${month}-31` }
    })
      .sort({ date: 1 })
      .lean(),
    Shift.find({ branchId: req.user.branchId }).sort({ startTime: 1 }).lean(),
    User.findById(req.user.id)
      .populate('shiftId', 'name startTime endTime graceMinutes')
      .select('shiftId')
      .lean(),
    Meeting.find({
      branchId: req.user.branchId,
      date: { $gte: `${month}-01`, $lte: `${month}-31` },
      cancelledAt: null,
      ...(hasPermission(req.user, 'calendar.manage') ? {} : { attendees: req.user.id })
    })
      .populate('attendees', 'firstName lastName')
      .populate('createdBy', 'firstName lastName')
      .sort({ startsAt: 1 })
      .lean()
  ]);

  return sendSuccess(res, {
    message: 'Branch calendar loaded.',
    data: {
      holidays,
      meetings,
      shifts: hasPermission(req.user, 'calendar.manage') || hasPermission(req.user, 'employee.create')
        ? shifts
        : shifts.filter(
            shift => String(shift._id) === String(employee?.shiftId?._id || employee?.shiftId)
          ),
      myShift: employee?.shiftId || null
    }
  });
}

async function createMeeting(req, res) {
  if (!isBranchAdmin(req))
    return sendError(res, {
      statusCode: 403,
      message: 'You do not have permission to schedule branch meetings.',
      code: 'FORBIDDEN'
    });

  const { title, description = '', date, time, startsAt, endsAt, attendeeIds, mode = 'OFFLINE', meetLink = '', location = '' } = req.body || {};
  const start = typeof startsAt === 'string' ? new Date(startsAt) : null;
  const suppliedEnd = typeof endsAt === 'string' && endsAt.trim() ? new Date(endsAt) : null;
  const end = suppliedEnd && !Number.isNaN(suppliedEnd.getTime()) ? suppliedEnd : (start && !Number.isNaN(start.getTime()) ? new Date(start.getTime() + 60 * 60 * 1000) : null);
  const validStart =
    start &&
    !Number.isNaN(start.getTime()) &&
    start.toISOString() === startsAt &&
    start.getTime() >= Date.now() + 10 * 60 * 1000;
  if (
    typeof title !== 'string' ||
    title.trim().length < 3 ||
    title.trim().length > 160 ||
    typeof description !== 'string' ||
    description.length > 2000 ||
    !isValidDateKey(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '') ||
    !validStart ||
    !end || Number.isNaN(end.getTime()) || (suppliedEnd && end <= start) ||
    !['ONLINE', 'OFFLINE'].includes(mode) ||
    (mode === 'ONLINE' && !/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?.*)?$/i.test(String(meetLink).trim())) ||
    (mode === 'OFFLINE' && String(location).trim().length < 2) ||
    !Array.isArray(attendeeIds) ||
    attendeeIds.length < 1 ||
    attendeeIds.length > 100 ||
    attendeeIds.some(id => !mongoose.isValidObjectId(id))
  )
    return sendError(res, {
      statusCode: 400,
      message: 'Provide a meeting title, valid date and time at least 10 minutes from now, and one or more employees.',
      code: 'VALIDATION_ERROR'
    });

  const selectedIds = [...new Set(attendeeIds.map(String))];
  const employees = await User.find({
    _id: { $in: selectedIds },
    branchId: req.user.branchId,
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    isDelete: { $ne: true }
  }).select('_id');
  if (employees.length !== selectedIds.length)
    return sendError(res, {
      statusCode: 400,
      message: 'All meeting attendees must be active employees in your branch.',
      code: 'INVALID_ATTENDEES'
    });

  const attendees = [...new Set([...selectedIds, String(req.user.id)])];
  const meeting = await Meeting.create({
    branchId: req.user.branchId,
    title: title.trim(),
    description: description.trim(),
    date,
    time,
    startsAt: start,
    endsAt: end,
    mode,
    meetLink: mode === 'ONLINE' ? String(meetLink).trim() : null,
    location: mode === 'OFFLINE' ? String(location).trim() : '',
    reminderAt: new Date(start.getTime() - 10 * 60 * 1000),
    attendees,
    createdBy: req.user.id
  });
  const result = await Meeting.findById(meeting._id)
    .populate('attendees', 'firstName lastName email')
    .populate('createdBy', 'firstName lastName email')
    .lean();

  // Email is best-effort: a missing SMTP setup must not roll back the meeting.
  let emailMessage = 'Email invitations could not be sent; check SMTP settings.';
  try {
    const invitedAttendees = result.attendees.filter(person => String(person._id) !== String(req.user.id));
    const organizer = {
      name: `${result.createdBy?.firstName || ''} ${result.createdBy?.lastName || ''}`.trim() || 'Branch Admin',
      email: result.createdBy?.email || process.env.SMTP_USER
    };
    const emailResult = await sendMeetingInvitations(result, invitedAttendees, organizer);
    if (!emailResult.skipped) {
      await Meeting.updateOne({ _id: meeting._id }, { $set: { emailSentAt: new Date() } });
      emailMessage = 'Email invitations sent.';
    } else {
      emailMessage = 'Meeting saved. Email invitations are disabled until SMTP is configured.';
    }
  } catch (emailError) {
    console.error('Unable to send meeting invitations:', emailError.message);
  }

  return sendSuccess(res, {
    statusCode: 201,
    message: `Meeting scheduled. In-app reminders are queued for 10 minutes before it starts. ${emailMessage}`,
    data: result
  });
}

async function cancelMeeting(req, res) {
  if (!isBranchAdmin(req))
    return sendError(res, {
      statusCode: 403,
      message: 'You do not have permission to cancel branch meetings.',
      code: 'FORBIDDEN'
    });
  if (!mongoose.isValidObjectId(req.params.id))
    return sendError(res, { statusCode: 404, message: 'Meeting not found.', code: 'NOT_FOUND' });

  const meeting = await Meeting.findOneAndDelete({
    _id: req.params.id,
    branchId: req.user.branchId
  });
  if (!meeting)
    return sendError(res, { statusCode: 404, message: 'Meeting not found in your branch.', code: 'NOT_FOUND' });

  await Notification.deleteMany({
    type: 'MEETING_REMINDER',
    referenceId: meeting._id
  });
  return sendSuccess(res, { message: 'Meeting cancelled.', data: { id: meeting._id } });
}


async function createHoliday(req, res) {
  try {
    if (!isBranchAdmin(req))
      return sendError(res, {
        statusCode: 403,
        message: 'Only the Branch Admin can add branch holidays.',
        code: 'FORBIDDEN'
      });

    const { startDate, endDate, date, title } = req.body || {};
    const start = startDate || date;
    const end = endDate || date;

    if (
      !isValidDateKey(start) ||
      !isValidDateKey(end) ||
      typeof title !== 'string' ||
      title.trim().length < 2 ||
      title.trim().length > 120
    )
      return sendError(res, {
        statusCode: 400,
        message: 'Provide a valid start date, end date and title.',
        code: 'VALIDATION_ERROR'
      });

    if (start > end)
      return sendError(res, {
        statusCode: 400,
        message: 'End date must be on or after the start date.',
        code: 'VALIDATION_ERROR'
      });

    const dates = enumerateDates(start, end);
    if (!dates.length || dates.length > MAX_HOLIDAY_DAYS)
      return sendError(res, {
        statusCode: 400,
        message: `A holiday range can span at most ${MAX_HOLIDAY_DAYS} days.`,
        code: 'VALIDATION_ERROR'
      });

    const groupId = new mongoose.Types.ObjectId();
    const cleanTitle = title.trim();
    const creatorId = req.user.id || req.user._id;

    const docs = dates.map(d => ({
      branchId: req.user.branchId,
      date: d,
      title: cleanTitle,
      groupId,
      startDate: start,
      endDate: end,
      createdBy: creatorId
    }));

    let inserted = [];
    try {
      inserted = await BranchHoliday.insertMany(docs, { ordered: false });
    } catch (err) {
      if (err.code === 11000 || (err.writeErrors && err.writeErrors.some(e => e.code === 11000))) {
        inserted = err.insertedDocs || [];
        return sendError(res, {
          statusCode: 409,
          message: inserted.length > 0
            ? `Holiday partially added (${inserted.length} day(s)). Some dates already had a holiday.`
            : 'A holiday is already set for one or more of these dates.',
          code: 'HOLIDAY_EXISTS',
          data: { inserted }
        });
      }
      throw err;
    }

    return sendSuccess(res, {
      statusCode: 201,
      message: dates.length === 1
        ? 'Holiday added to branch calendar.'
        : `Holiday added for ${dates.length} days.`,
      data: inserted
    });
  } catch (error) {
    console.error('createHoliday ERROR:', error);
    if (error.name === 'ValidationError') {
      return sendError(res, {
        statusCode: 400,
        message: Object.values(error.errors || {}).map(e => e.message).join(', ') || 'Invalid holiday data.',
        code: 'VALIDATION_ERROR'
      });
    }
    return sendError(res, {
      statusCode: 500,
      message: 'Could not add holiday. Please check server logs.',
      code: 'INTERNAL_ERROR'
    });
  }
}

async function deleteHoliday(req, res) {
  if (!isBranchAdmin(req))
    return sendError(res, {
      statusCode: 403,
      message: 'Only the Branch Admin can remove branch holidays.',
      code: 'FORBIDDEN'
    });

  if (!mongoose.isValidObjectId(req.params.id))
    return sendError(res, { statusCode: 404, message: 'Holiday not found in your branch.', code: 'NOT_FOUND' });

  const holiday = await BranchHoliday.findOne({
    _id: req.params.id,
    branchId: req.user.branchId
  });
  if (!holiday)
    return sendError(res, { statusCode: 404, message: 'Holiday not found in your branch.', code: 'NOT_FOUND' });

  // Agar groupId hai to poora multi-day holiday delete karo
  const filter = holiday.groupId
    ? { branchId: req.user.branchId, groupId: holiday.groupId }
    : { _id: holiday._id, branchId: req.user.branchId };

  const result = await BranchHoliday.deleteMany(filter);

  return sendSuccess(res, {
    message:
      result.deletedCount > 1
        ? `Holiday removed for ${result.deletedCount} days.`
        : 'Holiday removed from branch calendar.',
    data: { deletedCount: result.deletedCount, groupId: holiday.groupId || null }
  });
}

async function createShift(req, res) {
  if (!isBranchAdmin(req))
    return sendError(res, {
      statusCode: 403,
      message: 'Only the Branch Admin can manage shifts.',
      code: 'FORBIDDEN'
    });

  const { name, startTime, endTime } = req.body || {};
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (
    typeof name !== 'string' ||
    name.trim().length < 2 ||
    name.trim().length > 100 ||
    !timePattern.test(startTime || '') ||
    !timePattern.test(endTime || '') ||
    startTime === endTime
  )
    return sendError(res, {
      statusCode: 400,
      message: 'Provide a shift name, start time and a different end time.',
      code: 'VALIDATION_ERROR'
    });

  try {
    const shift = await Shift.create({
      branchId: req.user.branchId,
      name: name.trim(),
      startTime,
      endTime,
      graceMinutes: 120
    });
    return sendSuccess(res, {
      statusCode: 201,
      message: 'Shift created. The grace period is 2 hours.',
      data: shift
    });
  } catch (error) {
    if (error.code === 11000)
      return sendError(res, {
        statusCode: 409,
        message: 'A shift with this name already exists in your branch.',
        code: 'SHIFT_EXISTS'
      });
    throw error;
  }
}

async function assignShift(req, res) {
  if (!isBranchAdmin(req))
    return sendError(res, {
      statusCode: 403,
      message: 'Only the Branch Admin can assign employee shifts.',
      code: 'FORBIDDEN'
    });

  const { userId, shiftId } = req.body || {};
  if (
    !mongoose.isValidObjectId(userId) ||
    !mongoose.isValidObjectId(shiftId)
  )
    return sendError(res, {
      statusCode: 400,
      message: 'Select a valid employee and shift.',
      code: 'VALIDATION_ERROR'
    });

  const employee = await User.findOne({
    _id: userId,
    branchId: req.user.branchId,
    role: 'EMPLOYEE'
  });
  if (!employee)
    return sendError(res, {
      statusCode: 404,
      message: 'Employee not found in your branch.',
      code: 'EMPLOYEE_NOT_FOUND'
    });

  const shift = await Shift.findOne({
    _id: shiftId,
    branchId: req.user.branchId
  });
  if (!shift)
    return sendError(res, {
      statusCode: 400,
      message: 'Select a shift from your branch.',
      code: 'INVALID_SHIFT'
    });

  employee.shiftId = shift._id;
  await employee.save();

  return sendSuccess(res, {
    message: 'Employee shift assigned.',
    data: { userId: employee._id, shiftId: employee.shiftId }
  });
}

module.exports = {
  list,
  createMeeting,
  cancelMeeting,
  createHoliday,
  deleteHoliday,
  createShift,
  assignShift
};
