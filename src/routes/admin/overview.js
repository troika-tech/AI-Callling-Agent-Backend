const express = require('express');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const {
  getOverviewStats,
  getCallStats,
  getSystemHealth
} = require('../../controllers/admin/overview.controller');

const router = express.Router();

// All routes require authentication and admin role
router.use(requireAuth, requireAdmin);

// GET /api/v1/admin/stats/overview
router.get('/overview', getOverviewStats);

// GET /api/v1/admin/stats/calls
router.get('/calls', getCallStats);

// GET /api/v1/admin/stats/system-health
router.get('/system-health', getSystemHealth);

module.exports = router;
