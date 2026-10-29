const Meeting = require('../models/Meeting');
const Notification = require('../models/Notification');

let running = false;

async function deliverDueMeetingReminders() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const meetings = await Meeting.find({
      reminderSentAt: null,
      cancelledAt: null,
      reminderAt: { $lte: now },
      startsAt: { $gt: now }
    })
      .sort({ reminderAt: 1 })
      .limit(100)
      .lean();

    for (const meeting of meetings) {
      const minutesUntilStart = Math.max(
        1,
        Math.ceil((meeting.startsAt.getTime() - now.getTime()) / 60000)
      );
      const message = `Your meeting "${meeting.title}" starts in ${minutesUntilStart} minutes.`;
      for (const userId of meeting.attendees) {
        await Notification.updateOne(
          {
            userId,
            type: 'MEETING_REMINDER',
            referenceId: meeting._id
          },
          {
            $setOnInsert: {
              branchId: meeting.branchId,
              title: 'Meeting reminder',
              message
            }
          },
          { upsert: true }
        );
      }
      const stillActive = await Meeting.exists({
        _id: meeting._id,
        cancelledAt: null
      });
      if (!stillActive) {
        await Notification.deleteMany({
          type: 'MEETING_REMINDER',
          referenceId: meeting._id
        });
        continue;
      }
      await Meeting.updateOne(
        { _id: meeting._id, reminderSentAt: null, cancelledAt: null },
        { $set: { reminderSentAt: new Date() } }
      );
    }
  } finally {
    running = false;
  }
}

function startMeetingReminderWorker() {
  const timer = setInterval(() => {
    deliverDueMeetingReminders().catch(error => {
      console.error('Unable to deliver meeting reminders:', error);
    });
  }, 15 * 1000);
  timer.unref();
  deliverDueMeetingReminders().catch(error => {
    console.error('Unable to deliver meeting reminders:', error);
  });
  return () => clearInterval(timer);
}

module.exports = { startMeetingReminderWorker };
