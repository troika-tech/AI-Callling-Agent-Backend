const express = require('express');
const router = express.Router();
const voiceAgentsController = require('../../controllers/user/voiceAgents.controller');
const { requireAuth } = require('../../middleware/auth');

// Apply authentication middleware to all routes
router.use(requireAuth);

// Create a new voice agent
router.post('/', voiceAgentsController.create);

// Get all voice agents with pagination
router.get('/', voiceAgentsController.list);

// Sync phone-agent assignments to Millis
router.post('/sync-to-millis', voiceAgentsController.syncToMillis);

// Sync voice agents from Millis
router.post('/sync-from-millis', voiceAgentsController.syncFromMillis);

// Get a single voice agent by ID
router.get('/:id', voiceAgentsController.getById);

// Update a voice agent
router.put('/:id', voiceAgentsController.update);

// Delete a voice agent
router.delete('/:id', voiceAgentsController.delete);

module.exports = router;
