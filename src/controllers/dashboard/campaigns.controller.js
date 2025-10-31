const createError = require('http-errors');

const millis = require('../../clients/millis');
const asyncHandler = require('../../middleware/asyncHandler');
const { standardizeListResponse } = require('../../lib/responseUtils');
const { normalizeStatus } = require('../../lib/masking');

const DEFAULT_PAGE_SIZE = 25;

function normalizeCampaign(campaign) {
  if (!campaign || typeof campaign !== 'object') return null;
  return {
    id: campaign.id || campaign.campaign_id || null,
    name: campaign.name || campaign.title || null,
    caller: campaign.caller || campaign.phone_number || campaign.assigned_phone_number || null,
    status: normalizeStatus(campaign.status),
    created_at: campaign.created_at || campaign.createdAt || null
  };
}

const list = asyncHandler(async (req, res, next) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE, 100);

  try {
    const data = await millis.listCampaigns({ page, pageSize, search: req.query.search });
    const rawItems = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];
    const total = typeof data?.total === 'number' ? data.total : rawItems.length;

    const items = rawItems.map(normalizeCampaign).filter(Boolean);
    res.json(standardizeListResponse({ items, total }, page, pageSize));
  } catch (error) {
    // If Millis API fails, return empty results instead of failing the request
    if (error.status === 500 || error.status === 502 || error.status === 503) {
      console.warn(`Millis API unavailable for campaigns list - returning empty results: ${error.message}`);
      return res.json(standardizeListResponse({ items: [], total: 0 }, page, pageSize));
    }
    next(error);
  }
});

const detail = asyncHandler(async (req, res, next) => {
  try {
    const data = await millis.getCampaignDetail(req.params.id);
    res.json(data);
  } catch (error) {
    if (error.status === 404) {
      return next(createError(404, 'Campaign not found'));
    }
    next(error);
  }
});

const info = asyncHandler(async (req, res, next) => {
  try {
    const data = await millis.getCampaignInfo(req.params.id);
    res.json(data);
  } catch (error) {
    if (error.status === 404) {
      return next(createError(404, 'Campaign not found'));
    }
    next(error);
  }
});

module.exports = {
  list,
  detail,
  info
};