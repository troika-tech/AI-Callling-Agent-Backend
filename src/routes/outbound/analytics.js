const express = require('express');
const Campaign = require('../../models/Campaign');
const Call = require('../../models/Call');
const Lead = require('../../models/Lead');
const { requireAuth } = require('../../middleware/auth');
const { exportCallsToCSV, generateExportFilename } = require('../../services/exportService');
const asyncHandler = require('../../middleware/asyncHandler');

const router = express.Router();

// Apply authentication to all routes
router.use(requireAuth);

// GET /api/v1/outbound/campaigns/:id/analytics
router.get('/:id/analytics', asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({ 
    _id: req.params.id, 
    user_id: req.user.id 
  });

  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found or unauthorized' });
  }

  // Get all calls for this campaign
  const calls = await Call.find({ 
    campaign_id: campaign._id,
    type: 'outbound'
  });

  // Calculate analytics
  const totalCalls = calls.length;
  const callsAnswered = calls.filter(call => call.status === 'answered').length;
  const callsRemaining = campaign.stats.total_numbers - totalCalls;
  const answerRate = totalCalls > 0 ? (callsAnswered / totalCalls) * 100 : 0;
  const avgDuration = totalCalls > 0 ? 
    calls.reduce((sum, call) => sum + (call.duration_seconds || 0), 0) / totalCalls : 0;

  // Get leads for this campaign
  const leads = await Lead.find({ campaign_id: campaign._id });
  const conversions = leads.filter(lead => lead.status === 'converted').length;

  // Calculate cost (assuming $0.10 per minute)
  const totalMinutes = calls.reduce((sum, call) => sum + Math.ceil((call.duration_seconds || 0) / 60), 0);
  const cost = totalMinutes * 0.10;

  // Status breakdown
  const statusBreakdown = {
    answered: calls.filter(call => call.status === 'answered').length,
    no_answer: calls.filter(call => call.status === 'no_answer').length,
    busy: calls.filter(call => call.status === 'busy').length,
    failed: calls.filter(call => call.status === 'failed').length
  };

  res.status(200).json({
    campaign_id: campaign._id,
    campaign_name: campaign.name,
    calls_made: totalCalls,
    calls_remaining: callsRemaining,
    answer_rate: answerRate,
    avg_duration_seconds: avgDuration,
    conversions: conversions,
    cost: cost,
    status_breakdown: statusBreakdown,
    total_leads: leads.length,
    conversion_rate: leads.length > 0 ? (conversions / leads.length) * 100 : 0
  });
}));

// GET /api/v1/outbound/campaigns/:id/calls
router.get('/:id/calls', asyncHandler(async (req, res) => {
  const { status, date_from, date_to, page = 1, limit = 20 } = req.query;

  // Verify campaign belongs to user
  const campaign = await Campaign.findOne({ 
    _id: req.params.id, 
    user_id: req.user.id 
  });

  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found or unauthorized' });
  }

  const query = { 
    campaign_id: campaign._id,
    type: 'outbound'
  };

  if (status) {
    query.status = status;
  }

  if (date_from || date_to) {
    query.created_at = {};
    if (date_from) query.created_at.$gte = new Date(date_from);
    if (date_to) query.created_at.$lte = new Date(date_to);
  }

  const calls = await Call.find(query)
    .sort({ created_at: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit))
    .select('phone_to status duration_seconds disposition created_at lead_extracted');

  const totalDocs = await Call.countDocuments(query);

  res.status(200).json({
    calls: calls,
    totalDocs: totalDocs,
    limit: parseInt(limit),
    page: parseInt(page),
    totalPages: Math.ceil(totalDocs / parseInt(limit)),
    hasNextPage: parseInt(page) < Math.ceil(totalDocs / parseInt(limit)),
    nextPage: parseInt(page) < Math.ceil(totalDocs / parseInt(limit)) ? parseInt(page) + 1 : null,
    hasPrevPage: parseInt(page) > 1,
    prevPage: parseInt(page) > 1 ? parseInt(page) - 1 : null,
  });
}));

// POST /api/v1/outbound/campaigns/:id/calls/export
router.post('/:id/calls/export', asyncHandler(async (req, res) => {
  const { filters = {} } = req.body;

  // Verify campaign belongs to user
  const campaign = await Campaign.findOne({ 
    _id: req.params.id, 
    user_id: req.user.id 
  });

  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found or unauthorized' });
  }

  const query = { 
    campaign_id: campaign._id,
    type: 'outbound'
  };

  // Apply filters
  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.date_from || filters.date_to) {
    query.created_at = {};
    if (filters.date_from) query.created_at.$gte = new Date(filters.date_from);
    if (filters.date_to) query.created_at.$lte = new Date(filters.date_to);
  }

  const calls = await Call.find(query)
    .sort({ created_at: -1 })
    .lean();

  // Use export service to generate CSV
  const csv = exportCallsToCSV(calls);
  const filename = generateExportFilename('campaign-calls', 'csv', campaign._id.toString());

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}));

module.exports = router;
