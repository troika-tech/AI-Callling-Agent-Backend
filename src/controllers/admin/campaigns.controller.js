const millis = require('../../clients/millis');
const CampaignApproval = require('../../models/CampaignApproval');
const AdminAudit = require('../../models/AdminAudit');
const asyncHandler = require('../../middleware/asyncHandler');
const { createAuditLog, getClientInfo } = require('../../lib/responseUtils');

exports.approve = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { approve, reason } = req.body;
  const clientInfo = getClientInfo(req);

  const status = approve ? 'approved' : 'rejected';
  const out = await millis.approveCampaign(id, { status, reason });

  const record = await CampaignApproval.create({
    campaignId: id,
    approvedBy: req.user._id,
    status,
    reason,
    millisResponse: out
  });

  // Audit log
  await createAuditLog(AdminAudit, {
    actor: req.user._id,
    action: approve ? 'approve_campaign' : 'reject_campaign',
    target: id,
    targetType: 'campaign',
    diff: { status, reason },
    reason,
    millisResponse: out,
    ...clientInfo
  });

  res.json({ status, record });
});
