const express = require('express');
const axios = require('axios');
const Call = require('../../models/Call');
const Lead = require('../../models/Lead');
const User = require('../../models/User');
const { requireAuth } = require('../../middleware/auth');
const { exportCallsToCSV, generateExportFilename } = require('../../services/exportService');
const ExotelPhone = require('../../models/ExotelPhone');
const { fetchInboundCalls } = require('../../services/exotelService');
const asyncHandler = require('../../middleware/asyncHandler');

const router = express.Router();

// Apply authentication to all routes
router.use(requireAuth);

// GET /api/v1/inbound/calls
router.get('/', asyncHandler(async (req, res) => {
  const {
    date_from,
    date_to,
    phone,
    sentiment,
    keyword,
    direction,
    type,
    page = 1,
    limit = 20
  } = req.query;

  // Build filter object - show both inbound and outbound calls
  const filter = {
    user_id: req.user.id
  };

  // Date range filter
  if (date_from || date_to) {
    filter.created_at = {};
    if (date_from) {
      filter.created_at.$gte = new Date(date_from);
    }
    if (date_to) {
      filter.created_at.$lte = new Date(date_to);
    }
  }

  // Phone number filter
  if (phone) {
    filter.$or = [
      { phone_from: { $regex: phone, $options: 'i' } },
      { phone_to: { $regex: phone, $options: 'i' } }
    ];
  }

  // Sentiment filter
  if (sentiment) {
    filter.sentiment_score = {};
    switch (sentiment) {
      case 'positive':
        filter.sentiment_score.$gte = 0.6;
        break;
      case 'neutral':
        filter.sentiment_score.$gte = 0.4;
        filter.sentiment_score.$lt = 0.6;
        break;
      case 'negative':
        filter.sentiment_score.$lt = 0.4;
        break;
    }
  }

  // Keyword search in transcript
  if (keyword) {
    filter['transcript.full_text'] = { $regex: keyword, $options: 'i' };
  }

  // Type filter (inbound/outbound)
  if (type) {
    filter.type = type;
  }

  // Direction filter
  if (direction) {
    filter.direction = direction;
  }

  // Calculate pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const total = await Call.countDocuments(filter);

  // Execute query
  const calls = await Call.find(filter)
    .select('id phone_from phone_to type direction duration_seconds status sentiment_score lead_extracted disposition cost agent_id created_at')
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  // Ensure direction field is populated based on type
  const callsWithDirection = calls.map(call => {
    const callObj = call.toObject();
    // If direction is not set, derive it from type
    if (!callObj.direction && callObj.type) {
      callObj.direction = callObj.type === 'inbound' ? 'incoming' : 'outgoing';
    }
    return callObj;
  });

  res.json({
    success: true,
    items: callsWithDirection,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
}));

// POST /api/v1/inbound/calls/sync-exotel - Pull recent incoming calls from Exotel and upsert into DB
router.post('/sync-exotel', asyncHandler(async (req, res) => {
  const { date_from, date_to } = req.body || {};
  const userId = req.user.id;

  // Find all Exotel phones for this user with credentials
  const phones = await ExotelPhone.find({ user_id: userId, provider: 'exotel', status: { $in: ['active', 'live'] } });

  let imported = 0;
  for (const phone of phones) {
    if (!phone.account_sid || !(phone.api_key || phone.account_sid) || !phone.api_token) {
      continue;
    }

    const creds = {
      subdomain: phone.subdomain || 'api',
      account_sid: phone.account_sid,
      api_key: phone.api_key || phone.account_sid,
      api_token: phone.api_token,
    };

    let calls = [];
    try {
      calls = await fetchInboundCalls(creds, { from: date_from, to: date_to, page: 1, pageSize: 100 });
    } catch (err) {
      console.error('Exotel sync failed:', err.message);
      continue;
    }

    for (const c of calls) {
      // Best-effort field extraction across response shapes
      const phoneFrom = c.from || c.from_number || c.customer_number || c.call_from || '';
      const phoneTo = c.to || c.to_number || c.agent_number || c.call_to || phone.phone_number || '';
      const status = (c.status || c.call_status || '').toLowerCase() || 'answered';
      const durationSec = Number(c.duration || c.conversation_duration || c.total_duration || 0);
      const createdAt = new Date(c.start_time || c.date_created || c.created_at || Date.now());

      if (!phoneFrom || !phoneTo) continue;

      await Call.updateOne(
        {
          user_id: userId,
          type: 'inbound',
          millis_call_id: c.sid || c.call_sid || c.id || undefined,
          phone_from: phoneFrom,
          phone_to: phoneTo,
          created_at: createdAt,
        },
        {
          $setOnInsert: { user_id: userId, type: 'inbound' },
          $set: {
            phone_from: phoneFrom,
            phone_to: phoneTo,
            direction: 'incoming',
            status,
            duration_seconds: durationSec,
            cost: Number(c.price || c.cost || 0),
            agent_id: c.agent_id || c.agent || undefined,
            created_at: createdAt
          }
        },
        { upsert: true }
      );
      imported += 1;
    }
  }

  res.json({ success: true, imported });
}));

// GET /api/v1/inbound/calls/live - Fetch incoming call records directly from Exotel, no DB write
router.get('/live', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { from, to } = req.query;

  // Get user's assigned phone numbers from millis_config
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const userAssignedNumbers = user.millis_config?.assigned_phone_numbers || [];
  
  // If user has no assigned numbers, return empty result
  if (userAssignedNumbers.length === 0) {
    return res.json({ success: true, items: [] });
  }

  // Normalize assigned numbers for comparison (remove spaces, ensure consistent format)
  const normalizedAssignedNumbers = userAssignedNumbers.map(num => {
    // Remove spaces and ensure consistent format
    return num.trim().replace(/\s+/g, '');
  });

  let creds;
  // Find per-user ExotelPhone if exists
  const phones = await ExotelPhone.find({ user_id: userId, provider: 'exotel', status: { $in: ['active', 'live'] } });
  if (phones.length) {
    const phone = phones[0];
    creds = {
      subdomain: phone.subdomain || 'api',
      account_sid: phone.account_sid,
      api_key: phone.api_key || phone.account_sid,
      api_token: phone.api_token,
    };
    if (!creds.account_sid || !creds.api_key || !creds.api_token) {
      return res.status(400).json({ error: 'No valid Exotel credentials on file (user record).' });
    }
  } else {
    // Fallback: Use global env credentials
    creds = {
      subdomain: process.env.EXOTEL_SUBDOMAIN || 'api',
      account_sid: process.env.EXOTEL_ACCOUNT_SID,
      api_key: process.env.EXOTEL_API_KEY || process.env.EXOTEL_ACCOUNT_SID,
      api_token: process.env.EXOTEL_API_TOKEN,
    };
    if (!creds.account_sid || !creds.api_key || !creds.api_token) {
      return res.status(400).json({ error: 'No Exotel credentials present: please set env or user config.' });
    }
  }

  // Now hit Exotel using creds
  let calls = [];
  try {
    calls = await fetchInboundCalls(creds, { page: 1, pageSize: 100 });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to fetch from Exotel', detail: err.message });
  }

  // Only take incoming records
  let filtered = calls.filter(
    c => (c.direction === 'incoming' || c.call_direction === 'incoming')
  );

  // Filter by user's assigned phone numbers - only check 'To' field for incoming calls
  filtered = filtered.filter(c => {
    const callTo = (c.to || c.to_number || c.agent_number || c.call_to || '').toString().trim().replace(/\s+/g, '');
    // Check if call's 'To' number matches any of the user's assigned numbers
    return normalizedAssignedNumbers.some(assignedNum => {
      // Compare by exact match or by last 10 digits (in case of format differences)
      return callTo === assignedNum || 
             callTo === assignedNum.replace(/^\+91/, '91') || 
             callTo === assignedNum.replace(/^\+/, '') ||
             callTo.endsWith(assignedNum.slice(-10)) ||
             assignedNum.endsWith(callTo.slice(-10));
    });
  });

  // Additional query filters if provided
  if (from) filtered = filtered.filter(c => (c.from || c.from_number || c.customer_number || c.call_from) === from);
  if (to) filtered = filtered.filter(c => (c.to || c.to_number || c.agent_number || c.call_to) === to);

  res.json({ success: true, items: filtered });
}));

// GET /api/v1/inbound/calls/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const call = await Call.findOne({
    _id: req.params.id,
    user_id: req.user.id,
    type: 'inbound'
  });

  if (!call) {
    return res.status(404).json({ error: 'Call not found' });
  }

  // Get lead information if extracted
  let lead = null;
  if (call.lead_extracted && call.lead_id) {
    lead = await Lead.findById(call.lead_id);
  }

  const callObj = call.toObject();
  // Ensure direction field is populated based on type
  if (!callObj.direction && callObj.type) {
    callObj.direction = callObj.type === 'inbound' ? 'incoming' : 'outgoing';
  }

  res.json({
    success: true,
    ...callObj,
    lead
  });
}));

// POST /api/v1/inbound/calls/export
router.post('/export', asyncHandler(async (req, res) => {
  const { format = 'csv', filters = {} } = req.body;

  // Build filter object (same as GET /calls)
  const filter = {
    user_id: req.user.id,
    type: 'inbound'
  };

  if (filters.date_from || filters.date_to) {
    filter.created_at = {};
    if (filters.date_from) {
      filter.created_at.$gte = new Date(filters.date_from);
    }
    if (filters.date_to) {
      filter.created_at.$lte = new Date(filters.date_to);
    }
  }

  if (filters.phone) {
    filter.$or = [
      { phone_from: { $regex: filters.phone, $options: 'i' } },
      { phone_to: { $regex: filters.phone, $options: 'i' } }
    ];
  }

  if (filters.sentiment) {
    filter.sentiment_score = {};
    switch (filters.sentiment) {
      case 'positive':
        filter.sentiment_score.$gte = 0.6;
        break;
      case 'neutral':
        filter.sentiment_score.$gte = 0.4;
        filter.sentiment_score.$lt = 0.6;
        break;
      case 'negative':
        filter.sentiment_score.$lt = 0.4;
        break;
    }
  }

  if (filters.keyword) {
    filter['transcript.full_text'] = { $regex: filters.keyword, $options: 'i' };
  }

  // Get calls with lead information
  const calls = await Call.find(filter)
    .populate('lead_id', 'contact intent urgency status')
    .sort({ created_at: -1 })
    .lean();

  if (format === 'csv') {
    // Use export service to generate CSV
    const csv = exportCallsToCSV(calls);
    const filename = generateExportFilename('inbound-calls', 'csv', req.user.id);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csv);
    
  } else {
    res.status(400).json({ error: 'Unsupported format. Use "csv".' });
  }
}));

// --- Exotel helper endpoints (read-only, direct from Exotel, no DB writes) ---

// GET /api/v1/inbound/calls/exotel/fetch?callSid=...
router.get('/exotel/fetch', asyncHandler(async (req, res) => {
  const { callSid } = req.query;
  if (!callSid) return res.status(400).json({ error: 'Missing required query param: callSid' });

  const baseUrl = process.env.EXOTEL_BASE_URL || 'https://api.exotel.com';
  const accountSid = process.env.EXOTEL_ACCOUNT_SID;
  const apiKey = process.env.EXOTEL_API_KEY || process.env.EXOTEL_ACCOUNT_SID;
  const apiToken = process.env.EXOTEL_API_TOKEN || process.env.EXOTEL_AUTH_TOKEN;

  if (!accountSid || !apiKey || !apiToken) {
    return res.status(500).json({ error: 'Missing EXOTEL_ACCOUNT_SID and/or EXOTEL_API_KEY + EXOTEL_API_TOKEN' });
  }

  const url = `${baseUrl}/v1/Accounts/${accountSid}/Calls/${encodeURIComponent(callSid)}.json`;
  try {
    const response = await axios.get(url, { auth: { username: apiKey, password: apiToken } });
    return res.status(200).json({ ok: true, data: response.data });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    return res.status(status).json({ ok: false, error: message });
  }
}));

// GET /api/v1/inbound/calls/exotel/fetch-by-ref?refId=...
router.get('/exotel/fetch-by-ref', asyncHandler(async (req, res) => {
  const { refId } = req.query;
  if (!refId) return res.status(400).json({ error: 'Missing required query param: refId' });

  const baseUrl = process.env.EXOTEL_BASE_URL || 'https://api.exotel.com';
  const accountSid = process.env.EXOTEL_ACCOUNT_SID;
  const apiKey = process.env.EXOTEL_API_KEY || process.env.EXOTEL_ACCOUNT_SID;
  const apiToken = process.env.EXOTEL_API_TOKEN || process.env.EXOTEL_AUTH_TOKEN;

  if (!accountSid || !apiKey || !apiToken) {
    return res.status(500).json({ error: 'Missing EXOTEL_ACCOUNT_SID and/or EXOTEL_API_KEY + EXOTEL_API_TOKEN' });
  }

  const v2Url = `${baseUrl}/v2/accounts/${accountSid}/calls`;
  try {
    const v2Resp = await axios.get(v2Url, { params: { reference_id: refId }, auth: { username: apiKey, password: apiToken } });
    const items = v2Resp.data?.calls || v2Resp.data?.items || [];
    if (Array.isArray(items) && items.length > 0) {
      return res.status(200).json({ ok: true, data: v2Resp.data });
    }
  } catch (_) { /* fall back to v1 */ }

  try {
    const v1Resp = await axios.get(`${baseUrl}/v1/Accounts/${accountSid}/Calls.json`, {
      params: { ReferenceId: refId },
      auth: { username: apiKey, password: apiToken },
    });
    return res.status(200).json({ ok: true, data: v1Resp.data });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    return res.status(status).json({ ok: false, error: message });
  }
}));

// GET /api/v1/inbound/calls/exotel/incoming?start=...&end=...&sinceHours=24&pageSize=50
router.get('/exotel/incoming', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // Get user's assigned phone numbers from millis_config
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const userAssignedNumbers = user.millis_config?.assigned_phone_numbers || [];
  
  // If user has no assigned numbers, return empty result
  if (userAssignedNumbers.length === 0) {
    return res.status(200).json({ ok: true, count: 0, calls: [] });
  }

  // Normalize assigned numbers for comparison (remove spaces, ensure consistent format)
  const normalizedAssignedNumbers = userAssignedNumbers.map(num => {
    // Remove spaces and ensure consistent format
    return num.trim().replace(/\s+/g, '');
  });

  const baseUrl = process.env.EXOTEL_BASE_URL || 'https://api.exotel.com';
  const accountSid = process.env.EXOTEL_ACCOUNT_SID;
  const apiKey = process.env.EXOTEL_API_KEY || process.env.EXOTEL_ACCOUNT_SID;
  const apiToken = process.env.EXOTEL_API_TOKEN || process.env.EXOTEL_AUTH_TOKEN;

  if (!accountSid || !apiKey || !apiToken) {
    return res.status(500).json({ error: 'Missing EXOTEL_ACCOUNT_SID and/or EXOTEL_API_KEY + EXOTEL_API_TOKEN' });
  }

  const { start, end, sinceHours, pageSize } = req.query;
  const toIso = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 19);
  let startStr = start ? toIso(start) : undefined;
  let endStr = end ? toIso(end) : undefined;
  
  // Only apply default date range if sinceHours is provided, otherwise fetch ALL calls
  if (!startStr || !endStr) {
    if (sinceHours) {
      const hours = Number(sinceHours);
      const endDt = new Date();
      const startDt = new Date(endDt.getTime() - hours * 60 * 60 * 1000);
      startStr = toIso(startDt);
      endStr = toIso(endDt);
    } else {
      // No date filter - fetch ALL calls (no date restriction)
      startStr = undefined;
      endStr = undefined;
    }
  }

  const size = Math.min(Number(pageSize || 50), 200);
  const sortBy = 'DateCreated:desc';
  const auth = { username: apiKey, password: apiToken };

  const collected = [];
  try {
    let params = {
      PageSize: size,
      SortBy: sortBy,
      Direction: 'inbound',
    };
    
    // Only add date filter if dates are provided
    if (startStr && endStr) {
      params.DateCreated = `gte:${startStr};lte:${endStr}`;
    }

    let nextPath = `/v1/Accounts/${accountSid}/Calls.json`;
    let resp = await axios.get(`${baseUrl}${nextPath}`, { params, auth });
    const meta = resp.data?.Metadata || {};
    const calls = resp.data?.Calls || [];
    collected.push(...calls);

    let nextUri = meta.NextPageUri;
    while (nextUri) {
      const pageResp = await axios.get(`${baseUrl}${nextUri}`, { auth });
      const pageCalls = pageResp.data?.Calls || [];
      collected.push(...pageCalls);
      nextUri = pageResp.data?.Metadata?.NextPageUri;
    }

    // Map Exotel status to normalized status
    // Exotel API returns various status values, including descriptive outcomes like "Client hung-up before connecting to a"
    const normalizeExotelStatus = (exotelStatus, exotelOutcome = null, duration = 0) => {
      // Get both fields as strings
      const outcome = exotelOutcome ? String(exotelOutcome).toLowerCase().trim() : '';
      const status = exotelStatus ? String(exotelStatus).toLowerCase().trim() : '';
      
      // Combine all text for pattern matching
      const combinedText = `${outcome} ${status}`.trim().toLowerCase();
      
      // PRIORITY 1: Check for descriptive failure patterns FIRST (these override everything)
      // Exotel often returns descriptive text like "Client hung-up before connecting to a" in Status or Outcome field
      const failurePatterns = [
        'hung-up', 'hung up', 'hungup', 'client hung',
        'before connecting', 'not connected', 'disconnected',
        'abandoned', 'dropped', 'failed to connect', 'connection failed',
        'call ended', 'call failed', 'hung', 'connecting'
      ];
      
      const hasFailurePattern = failurePatterns.some(pattern => {
        if (pattern === 'hung' && combinedText.includes('connecting')) {
          return combinedText.includes('hung') && combinedText.includes('connecting');
        }
        return combinedText.includes(pattern);
      });
      
      if (hasFailurePattern) {
        console.log(`[Status Normalization] ✅ Descriptive failure pattern detected -> FAILED. Status: "${exotelStatus}", Outcome: "${exotelOutcome}", Duration: ${duration}s`);
        return 'failed';
      }
      
      // PRIORITY 2: If duration is 0 or very short (≤6 seconds) and status is "completed", it's likely failed
      if (status === 'completed' && duration <= 6) {
        console.log(`[Status Normalization] ✅ Short duration with "completed" status -> FAILED. Duration: ${duration}s, Status: "${exotelStatus}"`);
        return 'failed';
      }
      
      // PRIORITY 3: Check if status is explicitly "failed" or error
      if (status === 'failed' || status === 'error' || status === 'failure' || 
          status === 'cancelled' || status === 'canceled' || status === 'declined' || status === 'rejected') {
        return 'failed';
      }
      
      // PRIORITY 4: Check status mappings
      if (!status && !outcome) {
        // If no status but has duration > 0, likely completed; otherwise failed
        return duration > 6 ? 'completed' : 'failed';
      }
      
      // Exotel status mappings - be explicit about failed statuses
      const statusMap = {
        'completed': 'completed',
        'success': 'completed',
        'finished': 'completed',
        'answered': 'completed',
        'done': 'completed',
        'failed': 'failed',
        'error': 'failed',
        'failure': 'failed',
        'busy': 'busy',
        'busy signal': 'busy',
        'no-answer': 'no-answer',
        'no answer': 'no-answer',
        'noanswer': 'no-answer',
        'not answered': 'no-answer',
        'voicemail': 'voicemail',
        'ringing': 'ringing',
        'in-progress': 'ringing',
        'queued': 'ringing',
        'pending': 'ringing',
        'initiated': 'ringing',
        'cancelled': 'failed',
        'canceled': 'failed',
        'declined': 'failed',
        'rejected': 'failed'
      };
      
      // Try status first, then outcome
      let normalized = statusMap[status] || statusMap[outcome];
      
      // If not found in map, check duration
      if (!normalized) {
        normalized = duration > 6 ? 'completed' : 'failed';
      }
      
      // FINAL CHECK: If normalized is "completed" but we have descriptive failure indicators, override
      if (normalized === 'completed' && duration <= 6) {
        console.log(`[Status Normalization] ✅ Final override: Short duration -> FAILED. Duration: ${duration}s`);
        return 'failed';
      }
      
      return normalized;
    };

    // Helper function to check if call's 'To' number matches user's assigned numbers
    const matchesAssignedNumber = (callToNumber) => {
      if (!callToNumber) return false;
      const callTo = String(callToNumber).trim().replace(/\s+/g, '');
      // Check if call's 'To' number matches any of the user's assigned numbers
      return normalizedAssignedNumbers.some(assignedNum => {
        // Compare by exact match or by last 10 digits (in case of format differences)
        return callTo === assignedNum || 
               callTo === assignedNum.replace(/^\+91/, '91') || 
               callTo === assignedNum.replace(/^\+/, '') ||
               callTo.endsWith(assignedNum.slice(-10)) ||
               assignedNum.endsWith(callTo.slice(-10));
      });
    };

    // Process and normalize calls
    let callIndex = 0;
    const result = collected
      .filter(c => (c?.Direction || '').toLowerCase().includes('inbound'))
      .filter(c => {
        // For incoming calls, filter by 'To' field matching user's assigned numbers
        const callTo = c?.To || c?.to || c?.PhoneNumber || '';
        return matchesAssignedNumber(callTo);
      })
      .map(c => {
        // Extract ALL possible status/outcome fields from Exotel response
        // Exotel might return status in different fields: Status, status, CallStatus, Outcome, outcome, etc.
        const exotelStatus = c?.Status || c?.status || c?.CallStatus || c?.callStatus || '';
        const exotelOutcome = c?.Outcome || c?.outcome || c?.CallOutcome || c?.callOutcome || 
                             c?.Disposition || c?.disposition || c?.Description || c?.description || '';
        const duration = Number(c?.Duration || c?.duration || 0);
        
        // Log first few calls with FULL object to understand Exotel response structure
        if (callIndex++ < 5) {
          console.log(`[Exotel Call Data - Full Object]`, JSON.stringify(c, null, 2));
          console.log(`[Exotel Call Data] Status: "${exotelStatus}", Outcome: "${exotelOutcome}", Duration: ${duration}, Sid: ${c?.Sid}`);
        }
        
        // Normalize status - check ALL fields for descriptive text
        const normalizedStatus = normalizeExotelStatus(exotelStatus, exotelOutcome, duration);
        
        // Log if normalization changed status
        if (normalizedStatus !== 'completed' || duration <= 6) {
          console.log(`[Status Normalization Result] Original Status: "${exotelStatus}", Outcome: "${exotelOutcome}", Duration: ${duration}s, Normalized: "${normalizedStatus}"`);
        }
        
        return {
          Sid: c?.Sid,
          From: c?.From,
          To: c?.To,
          PhoneNumber: c?.PhoneNumber,
          Status: normalizedStatus,
          StartTime: c?.StartTime,
          EndTime: c?.EndTime,
          Duration: duration,
          RecordingUrl: c?.RecordingUrl,
          Uri: c?.Uri,
        };
      });

    return res.status(200).json({ ok: true, count: result.length, start: startStr, end: endStr, calls: result });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    return res.status(status).json({ ok: false, error: message });
  }
}));

module.exports = router;
