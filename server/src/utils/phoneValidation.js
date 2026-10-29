/**
 * Normalizes any phone input to the last 10 digits (India-friendly).
 * Returns '' for null/undefined.
 */
function normalizeTo10Digits(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\D/g, '').slice(-10);
}

/**
 * Optional phone: empty/null/undefined allowed; otherwise must be exactly 10 digits.
 */
function isValidOptionalPhone(value) {
  if (value === null || value === undefined || String(value).trim() === '') return true;
  const digits = normalizeTo10Digits(value);
  return /^\d{10}$/.test(digits);
}

/**
 * Required phone: must be exactly 10 digits (empty/null/undefined → invalid).
 */
function isValidRequiredPhone(value) {
  if (value === null || value === undefined || String(value).trim() === '') return false;
  const digits = normalizeTo10Digits(value);
  return /^\d{10}$/.test(digits);
}

module.exports = {
  normalizeTo10Digits,
  isValidOptionalPhone,
  isValidRequiredPhone
};