const millis = require('../../clients/millis');
const asyncHandler = require('../../middleware/asyncHandler');
const { standardizeListResponse } = require('../../lib/responseUtils');

const DEFAULT_PAGE_SIZE = 25;

function normalizeAgent(agent) {
  if (!agent || typeof agent !== 'object') return null;
  return {
    id: agent.id || agent.agentId || null,
    name: agent.name || agent.label || agent.agent_name || null,
    voice_label: agent.voice_label || agent.voiceLabel || null,
    language: agent.language || agent.locale || null,
    created_at: agent.created_at || agent.createdAt || null
  };
}

const list = asyncHandler(async (req, res, next) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE, 100);

  try {
    const data = await millis.listAgents({ page, pageSize, search: req.query.search });
    const rawItems = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];

    const total = typeof data?.total === 'number' ? data.total : rawItems.length;
    const items = rawItems
      .map(normalizeAgent)
      .filter(Boolean);

    res.json(standardizeListResponse({ items, total }, page, pageSize));
  } catch (error) {
    next(error);
  }
});

module.exports = { list };