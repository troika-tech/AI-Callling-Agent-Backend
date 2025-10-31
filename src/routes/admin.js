// src/routes/admin.js
const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const callsController = require('../controllers/admin/calls.controller');
const router = express.Router();

// Call logs
router.get('/call_logs', requireAuth, requireRole('admin'), callsController.callLogs);

module.exports = router;
