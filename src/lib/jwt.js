const jwt = require('jsonwebtoken');

function signAccess(payload, options = {}) {
  const { expiresIn, ...rest } = options;
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: expiresIn || process.env.ACCESS_TOKEN_TTL || '30m',
    ...rest
  });
}

function signRefresh(payload, options = {}) {
  const { expiresIn, ...rest } = options;
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: expiresIn || process.env.REFRESH_TOKEN_TTL || '7d',
    ...rest
  });
}

function verifyToken(token, options = {}) {
  return jwt.verify(token, process.env.JWT_SECRET, options);
}

module.exports = { signAccess, signRefresh, verifyToken };