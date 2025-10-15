const createError = require('http-errors');
const { verifyToken } = require('../lib/jwt');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const {
  SESSION_COOKIE_NAME,
  hashValue,
  normalizeUserAgent,
  normalizeIp,
  revokeSession
} = require('../lib/sessions');
const { resolveClientIp } = require('../lib/request');
const cfg = require('../config');

async function requireAuth(req, _res, next) {
  const hdr = req.headers.authorization || '';
  let token = hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : null;

  if (!token && req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
    token = req.cookies[SESSION_COOKIE_NAME];
  }

  if (!token) return next(createError(401, 'Missing token'));

  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).lean();
    if (!user) return next(createError(401, 'Invalid user'));

    if (payload.sid) {
      const session = await AuthSession.findOne({
        sessionId: payload.sid,
        user: user._id,
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() }
      });

      if (!session) {
        console.log('Session not found for sessionId:', payload.sid, 'User:', user._id);
        return next(createError(401, 'Session expired'));
      }

      // In development, be more lenient with user agent and IP validation
      if (cfg.env === 'production') {
        const userAgentHash = hashValue(normalizeUserAgent(req.headers['user-agent']));
        if (session.userAgentHash && userAgentHash && session.userAgentHash !== userAgentHash) {
          await revokeSession(session);
          return next(createError(401, 'Session mismatch'));
        }

        const ipHash = hashValue(normalizeIp(resolveClientIp(req)));
        if (session.ipHash && ipHash && session.ipHash !== ipHash) {
          await revokeSession(session);
          return next(createError(401, 'Session mismatch'));
        }
      }

      session.lastUsedAt = new Date();
      
      // Update session hashes if in production
      if (cfg.env === 'production') {
        const userAgentHash = hashValue(normalizeUserAgent(req.headers['user-agent']));
        const ipHash = hashValue(normalizeIp(resolveClientIp(req)));
        if (userAgentHash) session.userAgentHash = userAgentHash;
        if (ipHash) session.ipHash = ipHash;
      }
      
      await session.save().catch(() => {});
      req.authSession = session;
    }

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

function requireRoles(roles = []) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, _res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return next(createError(403, 'Forbidden'));
    }
    next();
  };
}

function requireRole(role) {
  return requireRoles([role]);
}

module.exports = { requireAuth, requireRole, requireRoles };
