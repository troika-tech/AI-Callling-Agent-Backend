const jwt = require('jsonwebtoken');

// Validate JWT_SECRET is set and has minimum length
function validateJWTSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  if (secret.length < 32) {
    console.warn('⚠️ WARNING: JWT_SECRET is shorter than 32 characters. Consider using a longer secret for better security.');
  }
  return secret;
}

function signAccess(payload, options = {}) {
  const secret = validateJWTSecret();
  const { expiresIn, ...rest } = options;
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn || process.env.ACCESS_TOKEN_TTL || '30m',
    ...rest
  });
}

function signRefresh(payload, options = {}) {
  const secret = validateJWTSecret();
  const { expiresIn, ...rest } = options;
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn || process.env.REFRESH_TOKEN_TTL || '7d',
    ...rest
  });
}

function verifyToken(token, options = {}) {
  const secret = validateJWTSecret();
  return jwt.verify(token, secret, options);
}

module.exports = { signAccess, signRefresh, verifyToken };