const jwt = require('jsonwebtoken');

function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.ACCESS_TOKEN_TTL || '30m' });
}
function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.REFRESH_TOKEN_TTL || '7d' });
}
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signAccess, signRefresh, verifyToken };
