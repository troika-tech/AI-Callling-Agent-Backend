const millis = require('../../clients/millis');
const CallLog = require('../../models/CallLog');
const asyncHandler = require('../../middleware/asyncHandler');
const { standardizeListResponse } = require('../../lib/responseUtils');

exports.callLogs = asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 50, from, to, status, agentId, phone } = req.query;
  const pageNumber = Number.parseInt(page, 10) || 1;
  const pageSizeNumber = Number.parseInt(pageSize, 10) || 50;

  let data;
  try {
    const params = {
      limit: pageSizeNumber
    };

    // Convert date strings to Unix timestamps for Millis API
    if (from) {
      const fromDate = new Date(from);
      params.start_time = Math.floor(fromDate.getTime() / 1000);
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999); // End of day
      params.end_time = Math.floor(toDate.getTime() / 1000);
    }

    // Use correct Millis API parameter names
    if (status) params.call_status = status;
    if (agentId) params.agent_id = agentId;
    if (phone) params.phone_number = phone;

    console.log('📤 Sending filters to Millis API:', params);
    data = await millis.listCallLogs(params);
    console.log('📥 Received from Millis API:', {
      itemCount: (data.items || data.histories || []).length,
      total: data.total || data.count,
      hasMore: data.has_more,
      nextCursor: data.next_cursor
    });
  } catch (error) {
    // If Millis API returns 404, it means no call logs exist yet or endpoint doesn't exist
    // Return empty array instead of throwing error
    if (error.status === 404) {
      console.log('No call logs found in Millis API (404), returning empty array');
      return res.json(standardizeListResponse([], pageNumber, pageSizeNumber));
    }
    // Re-throw other errors
    throw error;
  }

  // Handle both 'items' and 'histories' field names
  const callLogs = data.items || data.histories || [];
  const totalFromMillis = data.total || data.count || callLogs.length;

  // Process and transform the data to match our schema
  const processedLogs = [];

  if (Array.isArray(callLogs)) {
    for (const c of callLogs) {
      // Millis call-logs API returns:
      // - session_id: string
      // - call_id: string (optional)
      // - duration: number (in seconds)
      // - ts: number (timestamp)
      // - call_status: string
      // - voip: object (contains from/to phone numbers)

      const processedCall = {
        id: c.session_id || c.call_id || 'unknown',
        callId: c.session_id || c.call_id || 'unknown',
        from: c.voip?.from || c.from || 'Unknown',
        to: c.voip?.to || c.to || 'Unknown',
        startedAt: c.ts ? new Date(c.ts * 1000).toISOString() : null,
        endedAt: c.ts && c.duration ? new Date((c.ts + c.duration) * 1000).toISOString() : null,
        durationSec: c.duration || c.durationSec || 0,
        status: c.call_status || c.status || 'unknown',
        agentId: c.agent_id || null,
        meta: c
      };

      processedLogs.push(processedCall);

      // Save to MongoDB for caching
      await CallLog.updateOne(
        { callId: processedCall.callId },
        {
          $set: {
            from: processedCall.from,
            to: processedCall.to,
            startedAt: processedCall.startedAt,
            endedAt: processedCall.endedAt,
            durationSec: processedCall.durationSec,
            status: processedCall.status,
            meta: processedCall.meta
          }
        },
        { upsert: true }
      );
    }
  }

  // Return processed data with correct field names
  const response = {
    items: processedLogs,
    page: pageNumber,
    pageSize: pageSizeNumber,
    total: totalFromMillis // Use total from Millis API, not processed logs length
  };

  console.log('✅ Returning to frontend:', {
    itemCount: processedLogs.length,
    total: totalFromMillis,
    page: pageNumber
  });

  res.json(response);
});

