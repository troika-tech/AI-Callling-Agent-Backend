function maskPhoneNumber(phone) {
  if (!phone) return '';
  const trimmed = String(phone).trim();
  const prefix = trimmed.startsWith('+') ? '+' : '';
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (!digits) return trimmed;

  const country = digits.slice(0, Math.max(1, digits.length - 7));
  const lastTwo = digits.slice(-2);
  return `${prefix}${country || ''}*** **${lastTwo}`;
}

function normalizeStatus(status) {
  if (!status) return 'unknown';
  const value = String(status).toUpperCase();
  const map = {
    COMPLETED: 'completed',
    SUCCESS: 'completed',
    FINISHED: 'completed',
    FAILED: 'failed',
    ERROR: 'failed',
    DROPPED: 'abandoned',
    ABANDONED: 'abandoned',
    LIVE: 'live',
    ACTIVE: 'live',
    IN_PROGRESS: 'live',
    QUEUED: 'queued',
    PENDING: 'pending'
  };
  return map[value] || value.toLowerCase();
}

module.exports = {
  maskPhoneNumber,
  normalizeStatus
};