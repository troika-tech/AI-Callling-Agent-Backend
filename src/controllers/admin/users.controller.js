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
  role: user.role,
  assignedAgents: assignedAgents,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

exports.list = asyncHandler(async (req, res) => {
  const pageNumber = Number.parseInt(req.query.page, 10) || 1;
  const pageSizeNumber = Math.min(Number.parseInt(req.query.pageSize, 10) || 50, 100);
  const search = req.query.search?.trim();
  const role = req.query.role?.trim();

  const filter = {};
  if (role) filter.role = role;
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
  const userIds = users.map(user => user._id);
  const assignments = await AgentAssignment.find({ user: { $in: userIds } }).lean();
  
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
  const { email, name, password, role = 'user' } = req.body;

  const exists = await User.findOne({ email });
  if (exists) throw createError(409, 'Email already registered');

  const passwordHash = await hashPassword(password);
  const user = await User.create({ email, name, passwordHash, role });

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
