// src/routes/admin.js
const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/placeholder', requireAuth, requireRole('admin'), (_req, res) => {
  res.json({ message: 'Admin dashboard APIs will live here.' });
});

module.exports = router;
