const express = require('express');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Development-only endpoint to reset rate limits
if (process.env.NODE_ENV !== 'production') {
  router.post('/reset', (req, res) => {
    // This is a simple way to "reset" rate limits by restarting the server
    // In production, you'd want to use a proper rate limit store like Redis
    res.json({ 
      message: 'Rate limit reset requested. Please restart the server to clear rate limits.',
      note: 'This endpoint is only available in development mode.'
    });
  });
}

module.exports = router;
