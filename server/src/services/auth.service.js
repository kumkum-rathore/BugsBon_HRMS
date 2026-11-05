const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const RefreshSession = require('../models/RefreshSession');
const { sendPasswordResetEmail } = require('../utils/email');
const {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  createSessionFamilyId,
} = require('../utils/tokenUtils');

function authError(message, statusCode, code) {
  const e = new Error(message);
  e.statusCode = statusCode;
  e.code = code;
  return e;
}

function refreshExpiry() {
  const days = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || 7);

  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error('REFRESH_TOKEN_EXPIRES_DAYS must be 1–90.');
  }

  return new Date(Date.now() + days * 86400000);
}

async function safeUser(u) {
  const permissions = u.permissions || [];
  let customRole = null;

  if (u.customRoleId && u.branchId) {
    const CustomRole = require('../models/CustomRole');
    customRole = await CustomRole.findOne({
      _id: u.customRoleId,
      branchId: u.branchId,
    })
      .select('name')
      .lean();
  }

  return {
    id: u._id.toString(),
    employeeCode: u.employeeCode || null,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone,
    role: u.role,
    branchId: u.branchId ? u.branchId.toString() : null,
    departmentId: u.departmentId ? u.departmentId.toString() : null,
    status: u.status,
    joiningDate: u.joiningDate,
    leavingDate: u.leavingDate,
    experienceYears: u.experienceYears,
    experienceSummary: u.experienceSummary,
    hasPreviousExperience: u.hasPreviousExperience,
    previousCompanyName: u.previousCompanyName,
    previousCompanyLeavingDate: u.previousCompanyLeavingDate,
    previousCompanyLeavingReason: u.previousCompanyLeavingReason,
    salaryAmount: u.salaryAmount,
    customRoleId: u.customRoleId,
    customRoleName: customRole?.name || null,
    permissions,
  };
}

async function createSession(user, token, familyId, meta = {}) {
  return RefreshSession.create({
    userId: user._id,
    tokenHash: hashRefreshToken(token),
    familyId,
    expiresAt: refreshExpiry(),
    userAgent: meta.userAgent || null,
    ipAddress: meta.ipAddress || null,
  });
}

async function login({ email, password, meta = {} }) {
  const user = await User.findOne({ email }).select('+passwordHash');

  if (!user || user.status !== 'ACTIVE') {
    throw authError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  const matches = await bcrypt.compare(password, user.passwordHash);

  if (!matches) {
    throw authError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  const refreshToken = createRefreshToken();

  await createSession(user, refreshToken, createSessionFamilyId(), meta);

  user.lastLoginAt = new Date();
  await user.save();

  return {
    user: await safeUser(user),
    accessToken: createAccessToken(user),
    refreshToken,
    refreshExpiresAt: refreshExpiry().toISOString(),
  };
}

async function refresh(token, meta = {}) {
  if (!token || typeof token !== 'string') {
    throw authError('Refresh token is required.', 401, 'REFRESH_TOKEN_REQUIRED');
  }

  const hash = hashRefreshToken(token);

  const session = await RefreshSession.findOne({
    tokenHash: hash,
  }).select('+tokenHash');

  if (!session) {
    throw authError('Refresh token is invalid or expired.', 401, 'INVALID_REFRESH_TOKEN');
  }

  if (session.revokedAt) {
    await RefreshSession.updateMany(
      { familyId: session.familyId, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );

    throw authError(
      'Session token reuse detected. Please log in again.',
      401,
      'REFRESH_TOKEN_REUSED'
    );
  }

  if (session.expiresAt <= new Date()) {
    session.revokedAt = new Date();
    await session.save();

    throw authError(
      'Refresh token expired. Please log in again.',
      401,
      'REFRESH_TOKEN_EXPIRED'
    );
  }

  const user = await User.findById(session.userId);

  if (!user || user.status !== 'ACTIVE') {
    session.revokedAt = new Date();
    await session.save();

    throw authError('Account is not active.', 401, 'ACCOUNT_NOT_ACTIVE');
  }

  const nextToken = createRefreshToken();
  const nextHash = hashRefreshToken(nextToken);

  const claimed = await RefreshSession.findOneAndUpdate(
    {
      _id: session._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    {
      $set: {
        revokedAt: new Date(),
        replacedByTokenHash: nextHash,
      },
    },
    { new: true }
  );

  if (!claimed) {
    throw authError(
      'Refresh token has already been used.',
      401,
      'REFRESH_TOKEN_REUSED'
    );
  }

  try {
    await RefreshSession.create({
      userId: user._id,
      tokenHash: nextHash,
      familyId: session.familyId,
      expiresAt: refreshExpiry(),
      userAgent: meta.userAgent || session.userAgent,
      ipAddress: meta.ipAddress || session.ipAddress,
    });
  } catch (err) {
    await RefreshSession.updateMany(
      { familyId: session.familyId, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );

    throw err;
  }

  return {
    user: await safeUser(user),
    accessToken: createAccessToken(user),
    refreshToken: nextToken,
    refreshExpiresAt: refreshExpiry().toISOString(),
  };
}

async function logout(token) {
  if (!token || typeof token !== 'string') return;

  await RefreshSession.updateOne(
    {
      tokenHash: hashRefreshToken(token),
      revokedAt: null,
    },
    {
      $set: { revokedAt: new Date() },
    }
  );
}

// ⬇️ NEW: hash the raw reset token so we never store it in plaintext
function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ⬇️ NEW: forgot password
async function forgotPassword({ email }) {
  const user = await User.findOne({ email: String(email).toLowerCase().trim() });

  // Always succeed silently — do not leak whether email exists
  if (!user || user.status !== 'ACTIVE') {
    return { delivered: true };
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(rawToken);
  const ttlMinutes = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30);

  user.resetPasswordTokenHash = tokenHash;
  user.resetPasswordExpiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await user.save();

  const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';
  const resetUrl = `${appBaseUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;

  try {
    await sendPasswordResetEmail({
      to: user.email,
      name: user.firstName,
      resetUrl,
      expiresInMinutes: ttlMinutes,
    });
  } catch (err) {
    console.error('[auth] Failed to send password reset email:', err);
    // Do NOT throw — prevents leaking email existence
  }

  return { delivered: true };
}

// ⬇️ NEW: reset password
async function resetPassword({ token, password }) {
  if (!token || typeof token !== 'string') {
    throw authError('Reset token is required.', 400, 'RESET_TOKEN_REQUIRED');
  }

  const tokenHash = hashResetToken(token);

  const user = await User.findOne({
    resetPasswordTokenHash: tokenHash,
    resetPasswordExpiresAt: { $gt: new Date() },
  }).select('+resetPasswordTokenHash +resetPasswordExpiresAt +passwordHash');

  if (!user) {
    throw authError('Reset link is invalid or expired.', 400, 'RESET_TOKEN_INVALID');
  }

  user.passwordHash = await bcrypt.hash(password, 10);
  user.resetPasswordTokenHash = null;
  user.resetPasswordExpiresAt = null;

  // Invalidate all existing sessions
  user.tokenVersion = (user.tokenVersion || 0) + 1;

  await user.save();

  // Revoke all refresh sessions for this user
  await RefreshSession.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

  return { reset: true };
}

module.exports = {
  login,
  refresh,
  logout,
  safeUser,
  forgotPassword,
  resetPassword,
};