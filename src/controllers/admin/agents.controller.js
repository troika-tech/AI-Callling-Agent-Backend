const createError = require('http-errors');

const millis = require('../../clients/millis');
const User = require('../../models/User');
const AgentAssignment = require('../../models/AgentAssignment');
const asyncHandler = require('../../middleware/asyncHandler');
const { standardizeListResponse } = require('../../lib/responseUtils');

const toAssignment = (assignment) => ({
  id: assignment._id.toString(),
  agentId: assignment.agentId,
  userId: assignment.user.toString(),
  createdAt: assignment.createdAt,
  updatedAt: assignment.updatedAt
});

exports.list = asyncHandler(async (req, res) => {
  const pageNumber = Number.parseInt(req.query.page, 10) || 1;
  const pageSizeNumber = Math.min(Number.parseInt(req.query.pageSize, 10) || 50, 100);
  const search = req.query.search?.trim();

  const params = { page: pageNumber, pageSize: pageSizeNumber };
  if (search) params.search = search;

  const data = await millis.listAgents(params);

  const rawItems = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data)
      ? data
      : [];

  const total = typeof data?.total === 'number' ? data.total : rawItems.length;

  const agentIds = rawItems.map(agent => agent.id).filter(Boolean);

  const assignments = agentIds.length
    ? await AgentAssignment.find({ agentId: { $in: agentIds } }).lean()
    : [];

  const assignmentsByAgent = new Map(assignments.map(assignment => [assignment.agentId, assignment]));

  const items = rawItems.map(agent => ({
    ...agent,
    assignedUserId: assignmentsByAgent.get(agent.id)?.user?.toString() || null
  }));

  const response = standardizeListResponse({ items, total }, pageNumber, pageSizeNumber);
  res.json(response);
});

exports.assignToUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { agentId } = req.body;

  const user = await User.findById(id);
  if (!user) {
    throw createError(404, 'User not found');
  }

  const existingAssignment = await AgentAssignment.findOne({ agentId });
  if (existingAssignment) {
    if (existingAssignment.user.toString() === id) {
      return res.json({ assignment: toAssignment(existingAssignment) });
    }

    throw createError(409, 'Agent already assigned to another user');
  }

  const assignment = await AgentAssignment.create({
    agentId,
    user: user._id
  });

  res.status(201).json({ assignment: toAssignment(assignment) });
});

exports.unassignFromUser = asyncHandler(async (req, res) => {
  const { id, agentId } = req.params;

  const userExists = await User.exists({ _id: id });
  if (!userExists) {
    throw createError(404, 'User not found');
  }

  const assignment = await AgentAssignment.findOne({ agentId });
  if (!assignment) {
    throw createError(404, 'Assignment not found');
  }

  if (assignment.user.toString() !== id) {
    throw createError(409, 'Agent assigned to a different user');
  }

  await AgentAssignment.deleteOne({ _id: assignment._id });

  res.status(204).send();
});