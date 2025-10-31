// src/routes/user.js
const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const User = require('../models/User');
const exotelPhonesRoutes = require('./user/exotel-phones');
const voiceAgentsRoutes = require('./user/voice-agents');

const router = express.Router();

// GET /api/v1/user/assigned-phones - Get user's assigned phone numbers from millis_config
// NOTE: This endpoint is secured by requireAuth middleware and only returns phone numbers
// assigned to the authenticated user (req.user.id from JWT token)
router.get('/assigned-phones', requireAuth, asyncHandler(async (req, res) => {
  // req.user.id is set by requireAuth middleware from the JWT token
  // This ensures we only fetch the authenticated user's data
  const userId = req.user.id;
  
  console.log(`[assigned-phones] Fetching phone numbers for authenticated user: ${userId}`);
  
  const user = await User.findById(userId).lean();
  
  if (!user) {
    console.warn(`[assigned-phones] User not found for ID: ${userId}`);
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  // Get assigned phone numbers from millis_config for THIS specific user
  const assignedPhones = user.millis_config?.assigned_phone_numbers || [];
  
  console.log(`[assigned-phones] Found ${assignedPhones.length} assigned phone numbers for user ${userId}:`, assignedPhones);
  
  // Format phone numbers to match the expected structure
  const phoneNumbers = assignedPhones.map((phoneNumber, index) => ({
    id: `assigned_${index}_${phoneNumber}`,
    number: phoneNumber,
    name: `Assigned Phone ${index + 1}`,
    status: 'active',
    integration_status: 'success',
    provider: 'Assigned',
    is_assigned: true
  }));

  res.json({
    success: true,
    items: phoneNumbers,
    count: phoneNumbers.length
  });
}));

// Exotel phones routes
router.use('/exotel-phones', exotelPhonesRoutes);

// Voice agents routes
router.use('/voice-agents', voiceAgentsRoutes);

module.exports = router;
