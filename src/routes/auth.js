const express = require('express');
const { body, validationResult } = require('express-validator');
const createError = require('http-errors');

const User = require('../models/User');
const { hashPassword, verifyPassword } = require('../lib/password');
const {
  SESSION_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  createSession,
  findSessionByRefreshToken,
  rotateSession,
  revokeSession,
  getSessionCookieOptions,
  getRefreshCookieOptions
} = require('../lib/sessions');
const { resolveClientIp } = require('../lib/request');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

function buildUserResponse(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    subscription: {
      plan: user.subscription?.plan || 'basic',
      call_minutes_allocated: user.subscription?.call_minutes_allocated || 0,
      call_minutes_used: user.subscription?.call_minutes_used || 0
    }
  };
}

function setAuthCookies(res, accessToken, refreshToken) {
  const sessionOptions = getSessionCookieOptions();
  const refreshOptions = getRefreshCookieOptions();

  res.cookie(SESSION_COOKIE_NAME, accessToken, sessionOptions);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshOptions);
}

function clearAuthCookies(res) {
  const sessionOptions = getSessionCookieOptions();
  const refreshOptions = getRefreshCookieOptions();

  res.clearCookie(SESSION_COOKIE_NAME, { ...sessionOptions, maxAge: 0 });
  res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshOptions, maxAge: 0 });
}

function requestContext(req) {
  return {
    userAgent: req.headers['user-agent'],
    ipAddress: resolveClientIp(req)
  };
}

router.post('/signup',
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  body('name').isString().trim().notEmpty().withMessage('Name is required'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) throw createError(400, { errors: errors.array() });

      const { email, password, name } = req.body;
      const exists = await User.findOne({ email });
      if (exists) throw createError(409, 'Email already registered');

      const passwordHash = await hashPassword(password);
      
      // Create user with inbound role, active status, and subscription
      const user = await User.create({
        email,
        name,
        passwordHash,
        role: 'inbound', // Default to inbound role
        status: 'active',
        subscription: {
          plan: 'basic',
          call_minutes_allocated: 1000,
          call_minutes_used: 0,
          start_date: new Date(),
          notes: 'New inbound user'
        },
        millis_config: {
          assigned_phone_numbers: [],
          assigned_agents: [],
          assigned_knowledge_bases: []
        }
      });

      const { accessToken, refreshToken } = await createSession(user, requestContext(req));
      setAuthCookies(res, accessToken, refreshToken);

      res.status(201).json({ user: buildUserResponse(user) });
    } catch (e) { next(e); }
  });

router.post('/login',
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) throw createError(400, { errors: errors.array() });

      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user) throw createError(401, 'Invalid credentials');

      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) throw createError(401, 'Invalid credentials');

      // Check if user is suspended
      if (user.status === 'suspended') {
        throw createError(403, 'Account suspended. Please contact support.');
      }

      // Check if user is pending approval
      if (user.status === 'pending_approval') {
        throw createError(403, 'Account pending approval. Please wait for admin approval.');
      }

      const { accessToken, refreshToken } = await createSession(user, requestContext(req));
      setAuthCookies(res, accessToken, refreshToken);

      res.json({ user: buildUserResponse(user) });
    } catch (e) { next(e); }
  });

router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    
    if (!refreshToken) {
      // Missing token is expected after logout, don't log as error
      return res.status(400).json({ error: 'Missing refresh token' });
    }

    const context = requestContext(req);
    const session = await findSessionByRefreshToken(refreshToken, context);
    
    if (!session) {
      // Invalid token is expected after logout, don't log as error
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const user = await User.findById(session.user);
    if (!user) {
      await revokeSession(session);
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const { accessToken, refreshToken: rotatedRefreshToken } = await rotateSession(session, user, context);
    setAuthCookies(res, accessToken, rotatedRefreshToken);

    res.json({ user: buildUserResponse(user) });
  } catch (e) { 
    // Only log unexpected errors
    if (e.status && e.status >= 500) {
      console.error('Refresh error:', e.message);
    }
    next(e); 
  }
});

// Logout endpoint - use optionalAuth to get session if available, but don't fail if not
router.post('/logout', optionalAuth, async (req, res, next) => {
  try {
    // Try to get session from auth middleware if available
    if (req.authSession) {
      await revokeSession(req.authSession);
    } else if (req.cookies?.[REFRESH_COOKIE_NAME]) {
      // Try to find and revoke session by refresh token
      try {
        const session = await findSessionByRefreshToken(req.cookies[REFRESH_COOKIE_NAME], requestContext(req));
        if (session) {
          await revokeSession(session);
        }
      } catch (sessionError) {
        // Session might already be revoked or invalid, that's okay
        // Continue to clear cookies anyway
      }
    }

    // Always clear cookies, even if session wasn't found
    clearAuthCookies(res);
    res.status(204).send();
  } catch (e) { 
    // Even if there's an error, clear cookies and return success
    clearAuthCookies(res);
    res.status(204).send();
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;