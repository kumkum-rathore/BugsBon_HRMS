const nodemailer = require('nodemailer');
const icalModule = require('ical-generator');
const ical = icalModule.default || icalModule;

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[email] SMTP credentials missing. Email sending disabled.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  return transporter;
}

function buildIcsContent(meeting, attendees, organizer) {
  const calendar = ical({
    name: meeting.title,
    method: 'REQUEST',
    timezone: 'Asia/Kolkata'
  });

  const descriptionParts = [];
  if (meeting.description) descriptionParts.push(meeting.description);
  if (meeting.mode === 'ONLINE' && meeting.meetLink) {
    descriptionParts.push(`Join Google Meet: ${meeting.meetLink}`);
  } else if (meeting.mode === 'OFFLINE' && meeting.location) {
    descriptionParts.push(`Location: ${meeting.location}`);
  }

  calendar.createEvent({
    start: new Date(meeting.startsAt),
    end: new Date(meeting.endsAt),
    summary: meeting.title,
    description: descriptionParts.join('\n\n'),
    location:
      meeting.mode === 'ONLINE'
        ? meeting.meetLink || 'Online'
        : meeting.location || 'Office',
    method: 'REQUEST',
    status: 'CONFIRMED',
    organizer: { name: organizer.name, email: organizer.email },
    attendees: attendees.map(employee => ({
      name: `${employee.firstName || ''} ${employee.lastName || ''}`.trim(),
      email: employee.email,
      rsvp: true
    }))
  });

  return calendar.toString();
}

function buildHtmlBody(meeting, organizer) {
  const joinBlock =
    meeting.mode === 'ONLINE' && meeting.meetLink
      ? `<p style="margin: 16px 0;">
           <a href="${meeting.meetLink}"
              style="background:#1a73e8;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">
             Join Google Meet
           </a>
         </p>
         <p style="color:#555;font-size:13px;">Or copy this link: ${meeting.meetLink}</p>`
      : meeting.location
        ? `<p style="margin: 16px 0;"><strong>Location:</strong> ${meeting.location}</p>`
        : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color:#1a73e8;">Meeting Invitation</h2>
      <p>Hi,</p>
      <p><strong>${organizer.name}</strong> has invited you to a meeting.</p>
      <div style="background:#f5f7fa;padding:16px;border-radius:8px;margin:16px 0;">
        <p style="margin:0 0 8px;"><strong>${meeting.title}</strong></p>
        <p style="margin:0 0 8px;">📅 ${meeting.date} at ${meeting.time}</p>
        ${meeting.description ? `<p style="margin:0;color:#555;">${meeting.description}</p>` : ''}
      </div>
      ${joinBlock}
      <p style="color:#777;font-size:12px;margin-top:24px;">
        A calendar invitation (.ics) is attached. You can accept or decline it from your email client.
      </p>
    </div>
  `;
}

async function sendMeetingInvitations(meeting, attendees, organizer) {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn('[email] Skipping meeting invitations — transporter not configured.');
    return { skipped: true };
  }
  if (!attendees.length) return { skipped: true };

  const icsContent = buildIcsContent(meeting, attendees, organizer);
  const htmlBody = buildHtmlBody(meeting, organizer);
  const plainText = [
    `${organizer.name} invited you to: ${meeting.title}`,
    `When: ${meeting.date} at ${meeting.time}`,
    meeting.description ? `Details: ${meeting.description}` : '',
    meeting.mode === 'ONLINE' && meeting.meetLink ? `Join: ${meeting.meetLink}` : '',
    meeting.mode === 'OFFLINE' && meeting.location ? `Location: ${meeting.location}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  await mailer.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'Branch Calendar'}" <${process.env.SMTP_USER}>`,
    to: attendees.map(employee => employee.email).join(','),
    subject: `Meeting Invitation: ${meeting.title} (${meeting.date} ${meeting.time})`,
    text: plainText,
    html: htmlBody,
    icalEvent: {
      method: 'REQUEST',
      filename: 'meeting-invite.ics',
      content: icsContent
    }
  });

  return { sent: attendees.length };
}

module.exports = { sendMeetingInvitations };