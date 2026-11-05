const nodemailer = require('nodemailer');

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

async function sendPasswordResetEmail({ to, name, resetUrl, expiresInMinutes }) {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn('[email] Skipping password reset — transporter not configured.');
    return { skipped: true };
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color:#1a73e8;">Reset your password</h2>
      <p>Hi ${name || 'there'},</p>
      <p>We received a request to reset your Bugsbon HRMS password.
         This link is valid for <strong>${expiresInMinutes} minutes</strong>.</p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}"
           style="background:#1a73e8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
          Reset Password
        </a>
      </p>
      <p style="color:#555;font-size:13px;">Or copy this link: ${resetUrl}</p>
      <p style="color:#777;font-size:12px;margin-top:24px;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  `;

  const text = `Reset your Bugsbon HRMS password (valid ${expiresInMinutes} min): ${resetUrl}`;

  await mailer.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'Bugsbon HRMS'}" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Reset your Bugsbon HRMS password',
    text,
    html
  });

  return { sent: true };
}
async function sendWelcomeEmail({ to, name, email, password, employeeCode, companyName }) {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn('[email] Skipping welcome email — transporter not configured.');
    // Still log the password so the admin can share it manually
    console.log(`[email] Generated password for ${email}: ${password}`);
    return { skipped: true };
  }

  const loginUrl = process.env.FRONTEND_LOGIN_URL || 'http://localhost:3000/login';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color:#1a73e8;">Welcome to ${companyName}!</h2>
      <p>Hi ${name || 'there'},</p>
      <p>Your employee account has been created. Below are your login credentials:</p>

      <table style="border-collapse: collapse; margin: 20px 0; width: 100%;">
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; background: #f9f9f9;"><strong>Employee Code</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${employeeCode || '—'}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; background: #f9f9f9;"><strong>Email</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${email}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; background: #f9f9f9;"><strong>Temporary Password</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-size: 15px;">
            <strong>${password}</strong>
          </td>
        </tr>
      </table>

      <p style="margin: 24px 0;">
        <a href="${loginUrl}"
           style="background:#1a73e8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
          Log In Now
        </a>
      </p>

      <p style="color:#c0392b;font-size:13px;">
        ⚠️ Please change your password after your first login for security.
      </p>

      <p style="color:#777;font-size:12px;margin-top:24px;">
        If you did not expect this email, please contact your HR administrator.
      </p>
    </div>
  `;

  const text = `Welcome to ${companyName}!
Employee Code: ${employeeCode}
Email: ${email}
Temporary Password: ${password}

Login: ${loginUrl}
Please change your password after your first login.`;

  await mailer.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || companyName}" <${process.env.SMTP_USER}>`,
    to,
    subject: `Welcome to ${companyName} — Your Login Credentials`,
    text,
    html
  });

  return { sent: true };
}

module.exports = { sendPasswordResetEmail, sendWelcomeEmail, getTransporter };

// module.exports = { sendPasswordResetEmail, getTransporter };