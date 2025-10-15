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
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function buildUserResponse(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role
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
  body('name').optional().isString(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) throw createError(400, { errors: errors.array() });

      const { email, password, name } = req.body;
      const exists = await User.findOne({ email });
      if (exists) throw createError(409, 'Email already registered');

      const passwordHash = await hashPassword(password);
      const user = await User.create({ email, name, passwordHash, role: 'user' });

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

      const { accessToken, refreshToken } = await createSession(user, requestContext(req));
      setAuthCookies(res, accessToken, refreshToken);

      res.json({ user: buildUserResponse(user) });
    } catch (e) { next(e); }
  });

router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    console.log('Refresh attempt - has refresh token:', !!refreshToken);
    
    if (!refreshToken) throw createError(400, 'Missing refresh token');

    const context = requestContext(req);
    const session = await findSessionByRefreshToken(refreshToken, context);
    console.log('Refresh attempt - session found:', !!session);
    
    if (!session) throw createError(401, 'Invalid refresh token');

    const user = await User.findById(session.user);
    if (!user) {
      await revokeSession(session);
      throw createError(401, 'Invalid refresh token');
    }

    const { accessToken, refreshToken: rotatedRefreshToken } = await rotateSession(session, user, context);
    setAuthCookies(res, accessToken, rotatedRefreshToken);

    console.log('Refresh successful for user:', user.email);
    res.json({ user: buildUserResponse(user) });
  } catch (e) { 
    console.log('Refresh failed:', e.message);
    next(e); 
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    if (req.authSession) {
      await revokeSession(req.authSession);
    } else if (req.cookies?.[REFRESH_COOKIE_NAME]) {
      const session = await findSessionByRefreshToken(req.cookies[REFRESH_COOKIE_NAME], requestContext(req));
      if (session) await revokeSession(session);
    }

    clearAuthCookies(res);
    res.status(204).send();
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;