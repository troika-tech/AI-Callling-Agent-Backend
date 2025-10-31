const createError = require('http-errors');
const Campaign = require('../../models/Campaign');
const User = require('../../models/User');
const AdminAudit = require('../../models/AdminAudit');
const { emitToOutboundUser } = require('../../services/socketService');
const asyncHandler = require('../../middleware/asyncHandler');

/**
 * Get all pending campaigns awaiting approval
 * GET /api/v1/admin/campaigns/pending
 */
exports.getPendingCampaigns = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const pageNumber = parseInt(page, 10);
  const limitNumber = Math.min(parseInt(limit, 10), 100);

  const filter = { status: 'pending_approval' };

  const [campaigns, total] = await Promise.all([
    Campaign.find(filter)
      .populate('user_id', 'email name phone role subscription')
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .lean(),
    Campaign.countDocuments(filter)
  ]);

  res.json({
    campaigns: campaigns.map(campaign => ({
      id: campaign._id.toString(),
      name: campaign.name,
      description: campaign.description,
      user: campaign.user_id ? {
        id: campaign.user_id._id.toString(),
        email: campaign.user_id.email,
        name: campaign.user_id.name,
        role: campaign.user_id.role,
        subscription: campaign.user_id.subscription
      } : null,
      target_numbers_count: campaign.target_numbers.length,
      knowledge_base_files: campaign.knowledge_base_files,
      schedule: campaign.schedule,
      stats: campaign.stats,
      created_at: campaign.createdAt
    })),
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      pages: Math.ceil(total / limitNumber)
    }
  });
});

/**
 * Get campaign details for approval review
 * GET /api/v1/admin/campaigns/:id
 */
exports.getCampaignForReview = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const campaign = await Campaign.findById(id)
    .populate('user_id', 'email name phone role subscription millis_config')
    .lean();

  if (!campaign) {
    throw createError(404, 'Campaign not found');
  }

  res.json({
    campaign: {
      id: campaign._id.toString(),
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      user: campaign.user_id ? {
        id: campaign.user_id._id.toString(),
        email: campaign.user_id.email,
        name: campaign.user_id.name,
        role: campaign.user_id.role,
        subscription: campaign.user_id.subscription,
        millis_config: campaign.user_id.millis_config
      } : null,
      target_numbers: campaign.target_numbers, // Full list
      knowledge_base_files: campaign.knowledge_base_files,
      schedule: campaign.schedule,
      stats: campaign.stats,
      approval: campaign.approval,
      created_at: campaign.createdAt,
      updated_at: campaign.updatedAt
    }
  });
});

/**
 * Approve a campaign
 * POST /api/v1/admin/campaigns/:id/approve
 */
exports.approveCampaign = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    assigned_agent_id,
    assigned_kb_id,
    assigned_phone_number,
    admin_notes
  } = req.body;

  const campaign = await Campaign.findById(id);
  if (!campaign) {
    throw createError(404, 'Campaign not found');
  }

  if (campaign.status !== 'pending_approval') {
    throw createError(400, `Campaign cannot be approved. Current status: ${campaign.status}`);
  }

  // Update campaign with approval details
  campaign.status = 'approved';
  campaign.assigned_agent_id = assigned_agent_id;
  campaign.assigned_kb_id = assigned_kb_id;
  campaign.assigned_phone_number = assigned_phone_number;
  campaign.approval = {
    status: 'approved',
    reviewed_by_admin_id: req.user._id,
    reviewed_at: new Date(),
    admin_notes: admin_notes || ''
  };

  await campaign.save();

  // Log the approval
  await AdminAudit.log({
    actor: req.user._id,
    action: 'approve_campaign',
    target: id,
    targetType: 'campaign',
    details: {
      campaign_name: campaign.name,
      user_id: campaign.user_id.toString(),
      assigned_agent_id,
      assigned_kb_id,
      assigned_phone_number
    },
    reason: admin_notes || '',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  // Emit campaign:approved event to user
  emitToOutboundUser(campaign.user_id.toString(), 'campaign:approved', {
    campaign_id: campaign._id,
    campaign_name: campaign.name,
    assigned_agent_id,
    assigned_phone_number,
    admin_notes,
    approved_at: campaign.approval.reviewed_at
  });

  res.json({
    message: 'Campaign approved successfully',
    campaign: {
      id: campaign._id.toString(),
      name: campaign.name,
      status: campaign.status,
      approval: campaign.approval
    }
  });
});

/**
 * Reject a campaign
 * POST /api/v1/admin/campaigns/:id/reject
 */
exports.rejectCampaign = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rejection_reason } = req.body;

  if (!rejection_reason || rejection_reason.trim().length === 0) {
    throw createError(400, 'Rejection reason is required');
  }

  const campaign = await Campaign.findById(id);
  if (!campaign) {
    throw createError(404, 'Campaign not found');
  }

  if (campaign.status !== 'pending_approval') {
    throw createError(400, `Campaign cannot be rejected. Current status: ${campaign.status}`);
  }

  // Update campaign with rejection details
  campaign.status = 'rejected';
  campaign.approval = {
    status: 'rejected',
    reviewed_by_admin_id: req.user._id,
    reviewed_at: new Date(),
    rejection_reason: rejection_reason.trim()
  };

  await campaign.save();

  // Log the rejection
  await AdminAudit.log({
    actor: req.user._id,
    action: 'reject_campaign',
    target: id,
    targetType: 'campaign',
    details: {
      campaign_name: campaign.name,
      user_id: campaign.user_id.toString()
    },
    reason: rejection_reason,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  // Emit campaign:rejected event to user
  emitToOutboundUser(campaign.user_id.toString(), 'campaign:rejected', {
    campaign_id: campaign._id,
    campaign_name: campaign.name,
    rejection_reason,
    rejected_at: campaign.approval.reviewed_at
  });

  res.json({
    message: 'Campaign rejected',
    campaign: {
      id: campaign._id.toString(),
      name: campaign.name,
      status: campaign.status,
      approval: campaign.approval
    }
  });
});

/**
 * Get all campaigns (admin view - all statuses)
 * GET /api/v1/admin/campaigns
 */
exports.getAllCampaigns = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    user_id
  } = req.query;

  const pageNumber = parseInt(page, 10);
  const limitNumber = Math.min(parseInt(limit, 10), 100);

  const filter = {};
  if (status) filter.status = status;
  if (user_id) filter.user_id = user_id;

  const [campaigns, total] = await Promise.all([
    Campaign.find(filter)
      .populate('user_id', 'email name role')
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .lean(),
    Campaign.countDocuments(filter)
  ]);

  res.json({
    campaigns: campaigns.map(campaign => ({
      id: campaign._id.toString(),
      name: campaign.name,
      status: campaign.status,
      user: campaign.user_id ? {
        id: campaign.user_id._id.toString(),
        email: campaign.user_id.email,
        name: campaign.user_id.name
      } : null,
      stats: campaign.stats,
      created_at: campaign.createdAt,
      launched_at: campaign.launched_at,
      completed_at: campaign.completed_at
    })),
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      pages: Math.ceil(total / limitNumber)
    }
  });
});
