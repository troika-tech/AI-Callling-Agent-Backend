const express = require('express');
const router = express.Router();

// Liveness/readiness endpoint
router.get('/', async (_req, res) => {
  res.json({ status: 'ok' });
});

module.exports = router;
