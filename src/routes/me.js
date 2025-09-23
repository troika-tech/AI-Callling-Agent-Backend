const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/whoami', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
