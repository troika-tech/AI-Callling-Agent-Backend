// src/routes/user.js
const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/placeholder', requireAuth, requireRole('user'), (_req, res) => {
  res.json({ message: 'User dashboard APIs will live here.' });
});

module.exports = router;
