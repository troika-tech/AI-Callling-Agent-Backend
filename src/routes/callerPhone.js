const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  uploadKnowledgeBaseDocument,
  getKnowledgeBaseDocuments,
  deleteKnowledgeBaseDocument,
  getAgentDocuments,
  deleteAgentDocument,
  setCallerPhone,
  getCallerPhone,
  getUserCallerPhones,
  updateCallerPhoneStatus,
  deactivateCallerPhone,
  upload
} = require('../controllers/callerPhone');

// All routes require authentication
router.use(requireAuth);

// Knowledge base document routes
router.post('/campaigns/:campaignId/knowledge-base/upload', upload.single('file'), uploadKnowledgeBaseDocument);
router.get('/campaigns/:campaignId/knowledge-base/documents', getKnowledgeBaseDocuments);
router.delete('/campaigns/:campaignId/knowledge-base/documents/:documentId', deleteKnowledgeBaseDocument);

// Agent documents routes (new table)
router.get('/agent-documents', getAgentDocuments);
router.delete('/agent-documents/:documentId', deleteAgentDocument);

// Set caller phone for a campaign
router.post('/campaigns/:campaignId/caller-phone', setCallerPhone);

// Get caller phone for a campaign
router.get('/campaigns/:campaignId/caller-phone', getCallerPhone);

// Get all caller phones for authenticated user
router.get('/caller-phones', getUserCallerPhones);

// Update caller phone status
router.patch('/caller-phones/:callerPhoneId/status', updateCallerPhoneStatus);

// Deactivate caller phone
router.delete('/caller-phones/:callerPhoneId', deactivateCallerPhone);

module.exports = router;
