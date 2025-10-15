const createError = require('http-errors');

const millis = require('../../clients/millis');
const asyncHandler = require('../../middleware/asyncHandler');
const { standardizeListResponse } = require('../../lib/responseUtils');
const { maskPhoneNumber, normalizeStatus } = require('../../lib/masking');

const DEFAULT_PAGE_SIZE = 25;

function normalizePhone(phone) {
  if (!phone || typeof phone !== 'object') return null;
  const number = phone.number || phone.phone || phone.id || phone.phone_number;
  return {
    id: maskIfNeeded(number),
    agent_id: phone.agent_id || phone.agentId || null,
    status: normalizeStatus(phone.status),
    tags: Array.isArray(phone.tags) ? phone.tags : [],
    created_at: phone.created_at || phone.createdAt || null
  };
}

function maskIfNeeded(phone) {
  if (!phone) return '';
  const str = String(phone);
  return str.includes('*') ? str : maskPhoneNumber(str);
}

const list = asyncHandler(async (req, res, next) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE, 100);

  try {
    const data = await millis.listPhones({ page, pageSize, search: req.query.search });
    const rawItems = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];
    const total = typeof data?.total === 'number' ? data.total : rawItems.length;

    const items = rawItems.map(normalizePhone).filter(Boolean);
    res.json(standardizeListResponse({ items, total }, page, pageSize));
  } catch (error) {
    next(error);
  }
});

const detail = asyncHandler(async (req, res, next) => {
  try {
    const phone = await millis.getPhoneDetail(req.params.phone);
    res.json({
      id: maskIfNeeded(phone.number || phone.phone || phone.id),
      agent_id: phone.agent_id || phone.agentId || null,
      status: normalizeStatus(phone.status),
      tags: Array.isArray(phone.tags) ? phone.tags : [],
      created_at: phone.created_at || phone.createdAt || null,
      meta: phone.meta || null
    });
  } catch (error) {
    if (error.status === 404) {
      return next(createError(404, 'Phone not found'));
    }
    next(error);
  }
});

module.exports = {
  list,
  detail
};