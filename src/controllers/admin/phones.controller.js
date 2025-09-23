const millis = require('../../clients/millis');
const Phone = require('../../models/Phone');
const AdminAudit = require('../../models/AdminAudit');
const asyncHandler = require('../../middleware/asyncHandler');
const { standardizeListResponse, createAuditLog, getClientInfo } = require('../../lib/responseUtils');

exports.list = asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 50, search } = req.query;
  const pageNumber = Number.parseInt(page, 10) || 1;
  const pageSizeNumber = Number.parseInt(pageSize, 10) || 50;
  const searchTerm = typeof search === 'string' && search.length ? search : undefined;

  const data = await millis.listPhones({
    page: pageNumber,
    pageSize: pageSizeNumber,
    search: searchTerm
  });
  
  if (Array.isArray(data.items)) {
    for (const p of data.items) {
      await Phone.updateOne({ phoneId: p.id }, {
        $set: {
          number: p.number,
          tags: p.tags || [],
          agentId: p.agentId || null,
          meta: p
        }
      }, { upsert: true });
    }
  }
  
  const response = standardizeListResponse(data, pageNumber, pageSizeNumber);
  res.json(response);
});

exports.import = asyncHandler(async (req, res) => {
  const payload = req.body;
  const result = await millis.importPhones(payload);
  res.status(202).json({ message: 'Import queued', result });
});

exports.setAgent = asyncHandler(async (req, res) => {
  const { phone } = req.params;
  const { agentId } = req.body;
  const clientInfo = getClientInfo(req);

  const currentPhone = await Phone.findOne({ phoneId: phone });
  const oldAgentId = currentPhone?.agentId;

  const out = await millis.setPhoneAgent(phone, { agentId });
  await Phone.updateOne({ phoneId: phone }, { $set: { agentId, meta: out } }, { upsert: true });

  await createAuditLog(AdminAudit, {
    actor: req.user._id,
    action: 'set_agent',
    target: phone,
    targetType: 'phone',
    diff: { from: oldAgentId, to: agentId },
    millisResponse: out,
    ...clientInfo
  });

  res.json({ phone, agentId, out });
});

exports.updateTags = asyncHandler(async (req, res) => {
  const { phone } = req.params;
  const { tags } = req.body;
  const clientInfo = getClientInfo(req);

  const currentPhone = await Phone.findOne({ phoneId: phone });
  const oldTags = currentPhone?.tags || [];

  const out = await millis.updatePhoneTags(phone, { tags });
  await Phone.updateOne({ phoneId: phone }, { $set: { tags, meta: out } }, { upsert: true });

  await createAuditLog(AdminAudit, {
    actor: req.user._id,
    action: 'update_tags',
    target: phone,
    targetType: 'phone',
    diff: { from: oldTags, to: tags },
    millisResponse: out,
    ...clientInfo
  });

  res.json({ phone, tags, out });
});
