const createError = require('http-errors');

const User = require('../../models/User');
const AgentAssignment = require('../../models/AgentAssignment');
const asyncHandler = require('../../middleware/asyncHandler');
const { hashPassword } = require('../../lib/password');
const { standardizeListResponse } = require('../../lib/responseUtils');

const escapeRegExp = (input) => input.replace(/[\^$.*+?()[\]{}|]/g, '\\$&');

const toPublicUser = (user, assignedAgents = []) => ({
  id: user._id.toString(),
  email: user.email,
  name: user.name,
  phone: user.phone,
  role: user.role,
  status: user.status,
  subscription: user.subscription || {
    plan: 'basic',
    call_minutes_allocated: 0,
    call_minutes_used: 0
  },
  millis_config: user.millis_config || {
    assigned_phone_numbers: [],
    assigned_agents: [],
    assigned_knowledge_bases: []
  },
  assignedAgents: assignedAgents,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

exports.list = asyncHandler(async (req, res) => {
  const pageNumber = Number.parseInt(req.query.page, 10) || 1;
  const pageSizeNumber = Math.min(Number.parseInt(req.query.pageSize, 10) || 50, 100);
  const search = req.query.search?.trim();
  const role = req.query.role?.trim();
  const status = req.query.status?.trim();

  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (search) {
    const regex = new RegExp(escapeRegExp(search), 'i');
    filter.$or = [{ email: regex }, { name: regex }];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSizeNumber)
      .limit(pageSizeNumber)
      .lean(),
    User.countDocuments(filter)
  ]);

  // Get assigned agents for each user
  // Security: Validate userIds are valid MongoDB ObjectIds before querying
  const userIds = users
    .map(user => user._id)
    .filter(id => {
      // Validate MongoDB ObjectId format to prevent NoSQL injection
      if (!id || typeof id.toString !== 'function') return false;
      const idStr = id.toString();
      return /^[0-9a-fA-F]{24}$/.test(idStr);
    });
  
  let assignments = [];
  if (userIds.length > 0) {
    assignments = await AgentAssignment.find({ user: { $in: userIds } }).lean();
  }
  
  // Group assignments by user
  const assignmentsByUser = new Map();
  assignments.forEach(assignment => {
    const userId = assignment.user.toString();
    if (!assignmentsByUser.has(userId)) {
      assignmentsByUser.set(userId, []);
    }
    assignmentsByUser.get(userId).push(assignment.agentId);
  });

  const items = users.map(user => {
    const userAssignedAgents = assignmentsByUser.get(user._id.toString()) || [];
    return toPublicUser(user, userAssignedAgents);
  });

  const response = standardizeListResponse({ items, total }, pageNumber, pageSizeNumber);
  res.json(response);
});

exports.getOne = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) throw createError(404, 'User not found');
  res.json({ user: toPublicUser(user) });
});

exports.create = asyncHandler(async (req, res) => {
  const {
    email,
    name,
    phone,
    password,
    role = 'inbound',
    subscription = {}
  } = req.body;

  // Validate role
  if (!['admin', 'inbound', 'outbound'].includes(role)) {
    throw createError(400, 'Invalid role. Must be admin, inbound, or outbound');
  }

  const exists = await User.findOne({ email });
  if (exists) throw createError(409, 'Email already registered');

  const passwordHash = await hashPassword(password);

  const userData = {
    email,
    name,
    phone,
    passwordHash,
    role,
    status: 'active',
    subscription: {
      plan: subscription.plan || 'basic',
      call_minutes_allocated: subscription.call_minutes_allocated || 0,
      call_minutes_used: 0,
      start_date: subscription.start_date || new Date(),
      notes: subscription.notes || ''
    },
    millis_config: {
      assigned_phone_numbers: [],
      assigned_agents: [],
      assigned_knowledge_bases: []
    },
    created_by_admin_id: req.user._id
  };

  const user = await User.create(userData);

  // Log the action
  const AdminAudit = require('../../models/AdminAudit');
  await AdminAudit.log({
    actor: req.user._id,
    action: 'create_user',
    target: user._id.toString(),
    targetType: 'user',
    details: {
      email: user.email,
      role: user.role,
      subscription_plan: userData.subscription.plan
    },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(201).json({ user: toPublicUser(user) });
});

exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, role, password } = req.body;

  const updateDoc = {};
  if (typeof name !== 'undefined') updateDoc.name = name;
  if (typeof role !== 'undefined') updateDoc.role = role;
  if (typeof password !== 'undefined') {
    updateDoc.passwordHash = await hashPassword(password);
  }

  if (Object.keys(updateDoc).length === 0) {
    throw createError(400, 'No updates provided');
  }

  const user = await User.findByIdAndUpdate(id, { $set: updateDoc }, { new: true, runValidators: true }).lean();
  if (!user) throw createError(404, 'User not found');

  res.json({ user: toPublicUser(user) });
});

exports.remove = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (req.user?.id === id) {
    throw createError(400, 'You cannot delete your own account');
  }

  const user = await User.findByIdAndDelete(id);
  if (!user) throw createError(404, 'User not found');

  res.status(204).send();
});

// Get user's assigned agents with full details
exports.getAssignedAgents = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    throw createError(404, 'User not found');
  }

  const millis = require('../../clients/millis');
  const agentIds = user.assignedAgents || [];

  if (agentIds.length === 0) {
    return res.json({ items: [], total: 0 });
  }

  // Get all agents from Millis API
  const allAgents = await millis.listAgents({});
  const assignedAgents = allAgents.filter(agent => agentIds.includes(agent.id));

  res.json({
    items: assignedAgents,
    total: assignedAgents.length
  });
});

// Update user status (suspend/activate)
exports.updateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  if (!['active', 'suspended', 'pending_approval'].includes(status)) {
    throw createError(400, 'Invalid status. Must be active, suspended, or pending_approval');
  }

  const user = await User.findByIdAndUpdate(
    id,
    { $set: { status } },
    { new: true, runValidators: true }
  ).lean();

  if (!user) throw createError(404, 'User not found');

  // Log the action
  const AdminAudit = require('../../models/AdminAudit');
  const action = status === 'suspended' ? 'suspend_user' : 'activate_user';
  await AdminAudit.log({
    actor: req.user._id,
    action,
    target: id,
    targetType: 'user',
    details: { new_status: status },
    reason: reason || '',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.json({ user: toPublicUser(user) });
});

// Update user subscription
exports.updateSubscription = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    plan,
    call_minutes_allocated,
    start_date,
    end_date,
    notes
  } = req.body;

  const user = await User.findById(id);
  if (!user) throw createError(404, 'User not found');

  const updateData = {};
  if (plan) updateData['subscription.plan'] = plan;
  if (typeof call_minutes_allocated !== 'undefined') {
    updateData['subscription.call_minutes_allocated'] = call_minutes_allocated;
  }
  if (start_date) updateData['subscription.start_date'] = new Date(start_date);
  if (end_date) updateData['subscription.end_date'] = new Date(end_date);
  if (typeof notes !== 'undefined') updateData['subscription.notes'] = notes;

  const updatedUser = await User.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true, runValidators: true }
  ).lean();

  // Log the action
  const AdminAudit = require('../../models/AdminAudit');
  await AdminAudit.log({
    actor: req.user._id,
    action: 'update_subscription',
    target: id,
    targetType: 'user',
    details: {
      plan,
      call_minutes_allocated,
      previous_allocated: user.subscription?.call_minutes_allocated
    },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.json({ user: toPublicUser(updatedUser) });
});

// Get user usage statistics
exports.getUsage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id).lean();
  if (!user) throw createError(404, 'User not found');

  const Call = require('../../models/Call');
  const Campaign = require('../../models/Campaign');
  const Lead = require('../../models/Lead');

  // Get call statistics
  const [totalCalls, callDuration, callCost] = await Promise.all([
    Call.countDocuments({ user_id: id }),
    Call.aggregate([
      { $match: { user_id: user._id } },
      { $group: { _id: null, totalDuration: { $sum: '$duration_seconds' } } }
    ]),
    Call.aggregate([
      { $match: { user_id: user._id } },
      { $group: { _id: null, totalCost: { $sum: '$cost' } } }
    ])
  ]);

  // Get campaign statistics (for outbound users)
  let campaignStats = null;
  if (user.role === 'outbound') {
    const [totalCampaigns, activeCampaigns] = await Promise.all([
      Campaign.countDocuments({ user_id: id }),
      Campaign.countDocuments({ user_id: id, status: 'active' })
    ]);
    campaignStats = { total: totalCampaigns, active: activeCampaigns };
  }

  // Get lead statistics
  const [totalLeads, convertedLeads] = await Promise.all([
    Lead.countDocuments({ user_id: id }),
    Lead.countDocuments({ user_id: id, status: 'converted' })
  ]);

  const usage = {
    user: {
      id: user._id.toString(),
      email: user.email,
      role: user.role
    },
    subscription: user.subscription || {
      plan: 'basic',
      call_minutes_allocated: 0,
      call_minutes_used: 0
    },
    calls: {
      total: totalCalls,
      total_duration_seconds: callDuration[0]?.totalDuration || 0,
      total_cost: callCost[0]?.totalCost || 0
    },
    campaigns: campaignStats,
    leads: {
      total: totalLeads,
      converted: convertedLeads,
      conversion_rate: totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(2) : 0
    },
    usage_percentage: user.subscription?.call_minutes_allocated > 0
      ? ((user.subscription.call_minutes_used / user.subscription.call_minutes_allocated) * 100).toFixed(2)
      : 0
  };

  res.json(usage);
});
