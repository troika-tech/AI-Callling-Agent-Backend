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

  if (!token) {
    // Don't log missing token as error - it's expected for unauthenticated requests
    return next(createError(401, 'Missing token'));
  }

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

    // Check if user is suspended
    if (user.status === 'suspended') {
      return next(createError(403, 'Account suspended. Please contact support.'));
    }

    // Check if user is pending approval
    if (user.status === 'pending_approval') {
      return next(createError(403, 'Account pending approval.'));
    }

    req.user = {
      id: user._id.toString(),
      _id: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
      status: user.status,
      subscription: user.subscription
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

// Optional auth middleware - doesn't fail if token is missing, but sets req.user if valid token is present
async function optionalAuth(req, _res, next) {
  const hdr = req.headers.authorization || '';
  let token = hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : null;

  if (!token && req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
    token = req.cookies[SESSION_COOKIE_NAME];
  }

  // If no token, just continue without setting req.user
  if (!token) {
    return next();
  }

  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).lean();
    if (!user) return next();

    if (payload.sid) {
      const session = await AuthSession.findOne({
        sessionId: payload.sid,
        user: user._id,
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() }
      });

      if (!session) {
        return next();
      }

      req.authSession = session;
    }

    req.user = {
      id: user._id.toString(),
      _id: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
      status: user.status,
      subscription: user.subscription
    };
    next();
  } catch (err) {
    // For optional auth, just continue without setting req.user on any error
    next();
  }
}

// Convenience functions for specific roles
const requireAdmin = requireRole('admin');
const requireInbound = requireRole('inbound');
const requireOutbound = requireRole('outbound');

// Middleware to require inbound OR outbound (for shared features)
const requireInboundOrOutbound = requireRoles(['inbound', 'outbound']);

module.exports = {
  requireAuth,
  requireRole,
  requireRoles,
  requireAdmin,
  requireInbound,
  requireOutbound,
  requireInboundOrOutbound,
  optionalAuth
};
