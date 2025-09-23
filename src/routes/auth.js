const express = require('express');
const { body, validationResult } = require('express-validator');
const createError = require('http-errors');

const User = require('../models/User');
const { hashPassword, verifyPassword } = require('../lib/password');
const { signAccess, signRefresh, verifyToken } = require('../lib/jwt');

const router = express.Router();

/**
 * POST /api/v1/auth/signup
 * Creates a user (role defaults to 'user').
 * To create an admin, set role in DB manually or add a protected admin-creation route later.
 */
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

      const access = signAccess({ sub: user._id.toString(), email: user.email, role: user.role });
      const refresh = signRefresh({ sub: user._id.toString() });

      res.status(201).json({
        user: { id: user._id, email: user.email, name: user.name, role: user.role },
        tokens: { access, refresh }
      });
    } catch (e) { next(e); }
  });

/**
 * POST /api/v1/auth/login
 */
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

      const access = signAccess({ sub: user._id.toString(), email: user.email, role: user.role });
      const refresh = signRefresh({ sub: user._id.toString() });

      res.json({ tokens: { access, refresh }, user: { id: user._id, email: user.email, role: user.role, name: user.name } });
    } catch (e) { next(e); }
  });

/**
 * POST /api/v1/auth/refresh
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.body?.refreshToken;
    if (!token) throw createError(400, 'Missing refreshToken');
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).lean();
    if (!user) throw createError(401, 'Invalid refresh token');
    const access = signAccess({ sub: user._id.toString(), email: user.email, role: user.role });
    res.json({ access });
  } catch (e) { next(createError(401, 'Invalid refresh token')); }
});

module.exports = router;
