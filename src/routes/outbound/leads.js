const express = require('express');
const Campaign = require('../../models/Campaign');
const Lead = require('../../models/Lead');
const { requireAuth } = require('../../middleware/auth');
const { exportLeadsToCSV, generateExportFilename } = require('../../services/exportService');
const asyncHandler = require('../../middleware/asyncHandler');

const router = express.Router();

// Apply authentication to all routes
router.use(requireAuth);

// GET /api/v1/outbound/campaigns/:id/leads
router.get('/:id/leads', asyncHandler(async (req, res) => {
  const { status, urgency, page = 1, limit = 20 } = req.query;

  // Verify campaign belongs to user
  const campaign = await Campaign.findOne({ 
    _id: req.params.id, 
    user_id: req.user.id 
  });

  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found or unauthorized' });
  }

  const query = { 
    campaign_id: campaign._id
  };

  if (status) {
    query.status = status;
  }

  if (urgency) {
    query.urgency = urgency;
  }

  const leads = await Lead.find(query)
    .sort({ created_at: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit))
    .populate({ path: 'call_id', select: 'phone_to created_at' });

  const totalDocs = await Lead.countDocuments(query);

  res.status(200).json({
    leads: leads,
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

// PATCH /api/v1/outbound/leads/:id
router.patch('/:id', asyncHandler(async (req, res) => {
  const { status, notes, assigned_to, follow_up_date, conversion_value } = req.body;

  // Find lead and verify it belongs to user's campaign
  const lead = await Lead.findById(req.params.id).populate('call_id');
  
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  // Verify campaign belongs to user
  const campaign = await Campaign.findOne({ 
    _id: lead.campaign_id, 
    user_id: req.user.id 
  });

  if (!campaign) {
    return res.status(404).json({ error: 'Lead not found or unauthorized' });
  }

  // Update lead fields
  if (status) lead.status = status;
  if (assigned_to) lead.assigned_to = assigned_to;
  if (follow_up_date) lead.follow_up_date = new Date(follow_up_date);
  if (conversion_value) lead.conversion_value = conversion_value;

  // Add note if provided
  if (notes) {
    lead.notes.push({
      text: notes,
      added_by: req.user.id,
      added_at: new Date(),
    });
  }

  lead.updated_at = new Date();
  await lead.save();

  res.status(200).json(lead);
}));

// POST /api/v1/outbound/campaigns/:id/leads/export
router.post('/:id/leads/export', asyncHandler(async (req, res) => {
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
    campaign_id: campaign._id
  };

  // Apply filters
  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.urgency) {
    query.urgency = filters.urgency;
  }

  if (filters.date_from || filters.date_to) {
    query.created_at = {};
    if (filters.date_from) query.created_at.$gte = new Date(filters.date_from);
    if (filters.date_to) query.created_at.$lte = new Date(filters.date_to);
  }

  const leads = await Lead.find(query)
    .sort({ created_at: -1 })
    .populate('call_id', 'phone_to created_at')
    .lean();

  // Use export service to generate CSV
  const csv = exportLeadsToCSV(leads);
  const filename = generateExportFilename('campaign-leads', 'csv', campaign._id.toString());

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}));

module.exports = router;
