const createError = require('http-errors');
const { verifyToken } = require('../lib/jwt');
const User = require('../models/User');

async function requireAuth(req, _res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return next(createError(401, 'Missing token'));

  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).lean();
    if (!user) return next(createError(401, 'Invalid user'));

    req.user = {
      id: user._id.toString(),
      _id: user._id,
      email: user.email,
      role: user.role,
      name: user.name
    };
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return next(createError(401, 'Invalid token'));
    }
    if (err.name === 'TokenExpiredError') {
      return next(createError(401, 'Token expired'));
    }
    next(createError(401, 'Unauthorized'));
  }
}

function requireRole(role) {
  return (req, _res, next) => {
    if (!req.user || req.user.role !== role) return next(createError(403, 'Forbidden'));
    next();
  };
}

module.exports = { requireAuth, requireRole };
