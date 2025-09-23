const millis = require('../../clients/millis');
const CallLog = require('../../models/CallLog');
const Session = require('../../models/Session');
const asyncHandler = require('../../middleware/asyncHandler');
const { standardizeListResponse } = require('../../lib/responseUtils');

exports.callLogs = asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 50, from, to, status } = req.query;
  const pageNumber = Number.parseInt(page, 10) || 1;
  const pageSizeNumber = Number.parseInt(pageSize, 10) || 50;

  const data = await millis.listCallLogs({
    page: pageNumber,
    pageSize: pageSizeNumber,
    from,
    to,
    status
  });

  if (Array.isArray(data.items)) {
    for (const c of data.items) {
      await CallLog.updateOne({ callId: c.id }, {
        $set: {
          from: c.from,
          to: c.to,
          startedAt: c.startedAt ? new Date(c.startedAt) : undefined,
          endedAt: c.endedAt ? new Date(c.endedAt) : undefined,
          durationSec: c.durationSec,
          status: c.status,
          meta: c
        }
      }, { upsert: true });
    }
  }

  const response = standardizeListResponse(data, pageNumber, pageSizeNumber);
  res.json(response);
});

exports.sessions = asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 50, phone, agentId } = req.query;
  const pageNumber = Number.parseInt(page, 10) || 1;
  const pageSizeNumber = Number.parseInt(pageSize, 10) || 50;

  const data = await millis.listSessions({
    page: pageNumber,
    pageSize: pageSizeNumber,
    phone,
    agentId
  });

  if (Array.isArray(data.items)) {
    for (const s of data.items) {
      await Session.updateOne({ sessionId: s.id }, {
        $set: {
          userPhone: s.userPhone,
          agentId: s.agentId,
          startedAt: s.startedAt ? new Date(s.startedAt) : undefined,
          endedAt: s.endedAt ? new Date(s.endedAt) : undefined,
          meta: s
        }
      }, { upsert: true });
    }
  }

  const response = standardizeListResponse(data, pageNumber, pageSizeNumber);
  res.json(response);
});
