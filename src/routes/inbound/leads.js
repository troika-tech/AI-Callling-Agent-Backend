const express = require('express');
const Lead = require('../../models/Lead');
const Call = require('../../models/Call');
const { requireAuth } = require('../../middleware/auth');
const { exportLeadsToCSV, generateExportFilename } = require('../../services/exportService');
const asyncHandler = require('../../middleware/asyncHandler');

const router = express.Router();

// Apply authentication to all routes
router.use(requireAuth);

// GET /api/v1/inbound/leads
router.get('/', asyncHandler(async (req, res) => {
  const {
    status,
    urgency,
    date_from,
    date_to,
    page = 1,
    limit = 20
  } = req.query;

  // Build filter object
  const filter = {
    user_id: req.user.id,
    campaign_id: null // Inbound leads only
  };

  if (status) {
    filter.status = status;
  }

  if (urgency) {
    filter.urgency = urgency;
  }

  // Date range filter
  if (date_from || date_to) {
    filter.created_at = {};
    if (date_from) {
      filter.created_at.$gte = new Date(date_from);
    }
    if (date_to) {
      filter.created_at.$lte = new Date(date_to);
    }
  }

  // Calculate pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const total = await Lead.countDocuments(filter);

  // Execute query
  const leads = await Lead.find(filter)
    .populate('call_id', 'phone_from phone_to duration_seconds created_at')
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  res.json({
    success: true,
    data: leads,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
}));

// GET /api/v1/inbound/leads/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({
    _id: req.params.id,
    user_id: req.user.id,
    campaign_id: null
  }).populate('call_id');

  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  res.json({
    success: true,
    data: lead
  });
}));

// PATCH /api/v1/inbound/leads/:id
router.patch('/:id', asyncHandler(async (req, res) => {
  const {
    status,
    notes,
    assigned_to,
    follow_up_date,
    conversion_value
  } = req.body;

  const lead = await Lead.findOne({
    _id: req.params.id,
    user_id: req.user.id,
    campaign_id: null
  });

  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  // Prepare update object
  const updateData = {
    updated_at: new Date()
  };

  if (status) {
    updateData.status = status;
  }

  if (assigned_to) {
    updateData.assigned_to = assigned_to;
  }

  if (follow_up_date) {
    updateData.follow_up_date = new Date(follow_up_date);
  }

  if (conversion_value !== undefined) {
    updateData.conversion_value = conversion_value;
  }

  // Add note if provided
  if (notes && notes.trim()) {
    const newNote = {
      text: notes.trim(),
      added_by: req.user.id,
      added_at: new Date()
    };
    
    updateData.$push = { notes: newNote };
  }

  // Update lead
  const updatedLead = await Lead.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true }
  ).populate('call_id');

  res.json({
    success: true,
    data: updatedLead
  });
}));

// POST /api/v1/inbound/leads/export
router.post('/export', asyncHandler(async (req, res) => {
  const { filters = {} } = req.body;

  // Build filter object
  const filter = {
    user_id: req.user.id,
    campaign_id: null
  };

  if (filters.status) {
    filter.status = filters.status;
  }

  if (filters.urgency) {
    filter.urgency = filters.urgency;
  }

  if (filters.date_from || filters.date_to) {
    filter.created_at = {};
    if (filters.date_from) {
      filter.created_at.$gte = new Date(filters.date_from);
    }
    if (filters.date_to) {
      filter.created_at.$lte = new Date(filters.date_to);
    }
  }

  // Get leads
  const leads = await Lead.find(filter)
    .populate('call_id', 'phone_from phone_to created_at')
    .sort({ created_at: -1 })
    .lean();

  // Use export service to generate CSV
  const csv = exportLeadsToCSV(leads);
  const filename = generateExportFilename('inbound-leads', 'csv', req.user.id);
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(csv);
}));

module.exports = router;
