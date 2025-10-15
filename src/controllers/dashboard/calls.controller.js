const createError = require('http-errors');
const { Readable } = require('stream');

const millis = require('../../clients/millis');
const asyncHandler = require('../../middleware/asyncHandler');
const { maskPhoneNumber, normalizeStatus } = require('../../lib/masking');

const MAX_EXPORT_ROWS = 10000;
const EXPORT_PAGE_SIZE = 250;

const SPEAKER_LINE_REGEX = /^(agent|assistant|customer|caller|user|client|lead|prospect|system|bot)\s*[:\-]\s*(.+)$/i;
const MAX_CHAT_LINES = 500;

function parseListResponse(data) {
  if (Array.isArray(data)) {
    return { items: data, next_cursor: null, has_more: false };
  }

  return {
    items: Array.isArray(data?.items) ? data.items : [],
    next_cursor: data?.next_cursor || data?.nextCursor || null,
    has_more: Boolean(data?.has_more ?? data?.hasMore)
  };
}

function safeMask(phone) {
  if (!phone) return '';
  if (String(phone).includes('*')) return phone;
  return maskPhoneNumber(phone);
}

function toAgent(agent, fallbackId, fallbackName) {
  if (agent && typeof agent === 'object') {
    return {
      id: agent.id || agent.agent_id || fallbackId || null,
      name: agent.name || agent.agent_name || fallbackName || null
    };
  }
  return {
    id: fallbackId || null,
    name: fallbackName || null
  };
}

function toCallListItem(call) {
  const sessionId = call.session_id || call.sessionId || call.id || null;
  const agent = toAgent(call.agent, call.agent_id, call.agent_name);
  const maskedPhone = safeMask(call.masked_phone || call.phone || call.phone_number || call.to || call.from);

  return {
    session_id: sessionId,
    ts: call.ts || call.timestamp || call.started_at || call.created_at || null,
    agent,
    masked_phone: maskedPhone,
    duration_sec: call.duration_sec ?? call.duration ?? call.duration_seconds ?? 0,
    status: normalizeStatus(call.status),
    cost: typeof call.cost === 'number' ? call.cost : call.cost_total ?? call.cost_cents ?? 0
  };
}

function sanitizeSpeaker(value, fallback = 'system') {
  if (!value) return fallback;
  const normalized = String(value).trim();
  if (!normalized) return fallback;
  return normalized.toLowerCase();
}

function normalizeLineTranscript(line, fallbackSpeaker = 'system') {
  if (!line) return null;
  const trimmed = String(line).trim();
  if (!trimmed) return null;

  const match = trimmed.match(SPEAKER_LINE_REGEX);
  if (match) {
    return {
      speaker: sanitizeSpeaker(match[1], fallbackSpeaker),
      message: match[2].trim()
    };
  }

  return {
    speaker: fallbackSpeaker,
    message: trimmed
  };
}

function tryParseJson(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return null;
  }
}

function normalizeChatArray(entries) {
  if (!Array.isArray(entries)) return [];

  const normalized = [];
  for (const entry of entries) {
    if (entry == null) continue;

    if (typeof entry === 'string') {
      const parsed = normalizeLineTranscript(entry);
      if (parsed) normalized.push(parsed);
      continue;
    }

    if (Array.isArray(entry)) {
      const nested = normalizeChatArray(entry);
      normalized.push(...nested);
      continue;
    }

    if (typeof entry === 'object') {
      const speaker = sanitizeSpeaker(
        entry.speaker || entry.role || entry.from || entry.participant || entry.speaker_label
      );
      const message =
        entry.message ??
        entry.text ??
        entry.content ??
        entry.value ??
        '';
      const timestamp = entry.timestamp ?? entry.ts ?? entry.time ?? null;

      if (message == null || String(message).trim() === '') continue;

      normalized.push({
        ...entry,
        speaker,
        message: String(message),
        ...(timestamp ? { timestamp } : {})
      });
    }
  }

  return normalized.slice(0, MAX_CHAT_LINES);
}

function normalizeChatTranscript(chatData, transcriptData) {
  const candidate = chatData ?? transcriptData;

  if (!candidate) {
    return [];
  }

  if (Array.isArray(candidate)) {
    return normalizeChatArray(candidate);
  }

  if (typeof candidate === 'object') {
    if (Array.isArray(candidate.messages)) {
      return normalizeChatArray(candidate.messages);
    }
    if (Array.isArray(candidate.chat)) {
      return normalizeChatArray(candidate.chat);
    }
  }

  if (typeof candidate === 'string') {
    const parsed = tryParseJson(candidate);
    if (parsed) {
      return normalizeChatTranscript(parsed, null);
    }

    const lines = candidate
      .split(/\r?\n/)
      .map((line) => normalizeLineTranscript(line))
      .filter(Boolean);

    return lines.slice(0, MAX_CHAT_LINES);
  }

  return [];
}

function toCallDetail(call) {
  const agent = toAgent(call.agent, call.agent_id, call.agent_name);
  const recording = call.recording || {};
  const costBreakdown = Array.isArray(call.cost_breakdown || call.costBreakdown)
    ? call.cost_breakdown || call.costBreakdown
    : [];

  return {
    session_id: call.session_id || call.sessionId || call.id || null,
    agent,
    duration_sec: call.duration_sec ?? call.duration ?? call.duration_seconds ?? 0,
    status: normalizeStatus(call.status),
    chat: normalizeChatTranscript(call.chat, call.transcript),
    cost_breakdown: costBreakdown,
    recording: {
      available: Boolean(recording.available ?? recording.url ?? recording.has_audio)
    }
  };
}

function escapeCsvValue(value) {
  if (value === undefined || value === null) return '';
  const normalized = String(value);
  if (/[",\n]/.test(normalized)) {
    return '"' + normalized.replace(/"/g, '""') + '"';
  }
  return normalized;
}

const list = asyncHandler(async (req, res, next) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
  const params = {
    from: req.query.from,
    to: req.query.to,
    agent_id: req.query.agent_id,
    status: req.query.status,
    cursor: req.query.cursor,
    limit
  };

  try {
    const data = await millis.listCallLogs(params);
    const parsed = parseListResponse(data);
    const items = parsed.items.map(toCallListItem);

    res.json({
      items,
      next_cursor: parsed.next_cursor,
      has_more: parsed.has_more
    });
  } catch (error) {
    next(error);
  }
});

const detail = asyncHandler(async (req, res, next) => {
  try {
    const data = await millis.getCallDetail(req.params.sessionId);
    res.json(toCallDetail(data));
  } catch (error) {
    if (error.status === 404) {
      return next(createError(404, 'Call not found'));
    }
    next(error);
  }
});

const recording = asyncHandler(async (req, res, next) => {
  const headers = {};
  if (req.headers.range) {
    headers.Range = req.headers.range;
  }

  try {
    const upstream = await millis.streamCallRecording(req.params.sessionId, headers);
    const statusCode = upstream.status || 200;

    if (upstream.headers) {
      const headerEntries = Object.entries(upstream.headers)
        .filter(([key]) => !['transfer-encoding', 'connection'].includes(key.toLowerCase()));
      headerEntries.forEach(([key, value]) => res.setHeader(key, value));
    }

    res.setHeader('Cache-Control', 'private, no-store');
    res.status(statusCode);
    if (upstream.data instanceof Readable) {
      upstream.data.pipe(res);
    } else {
      res.send(upstream.data);
    }
  } catch (error) {
    if (error.status === 404) {
      return next(createError(404, 'Recording not found'));
    }
    if (error.status === 403) {
      return next(createError(403, 'Recording access forbidden'));
    }
    next(error);
  }
});

const exportCsv = asyncHandler(async (req, res, next) => {
  const baseParams = {
    from: req.query.from,
    to: req.query.to,
    agent_id: req.query.agent_id,
    status: req.query.status
  };

  const rows = ['session_id,ts,agent_id,agent_name,masked_phone,duration_sec,status,cost'];
  let fetched = 0;
  let cursor = req.query.cursor || null;
  let hasMore = true;

  try {
    while (hasMore && fetched < MAX_EXPORT_ROWS) {
      const params = {
        ...baseParams,
        cursor,
        limit: Math.min(EXPORT_PAGE_SIZE, MAX_EXPORT_ROWS - fetched)
      };
      const data = await millis.listCallLogs(params);
      const parsed = parseListResponse(data);

      parsed.items.forEach((item) => {
        if (fetched >= MAX_EXPORT_ROWS) return;
        const normalized = toCallListItem(item);
        const values = [
          normalized.session_id,
          normalized.ts,
          normalized.agent.id,
          normalized.agent.name,
          normalized.masked_phone,
          normalized.duration_sec,
          normalized.status,
          normalized.cost
        ];
        rows.push(values.map(escapeCsvValue).join(','));
        fetched += 1;
      });

      cursor = parsed.next_cursor;
      hasMore = parsed.has_more && Boolean(cursor);

      if (!cursor) {
        hasMore = false;
      }
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="call-logs.csv"');
    res.send(rows.join('\n'));
  } catch (error) {
    next(error);
  }
});

module.exports = {
  list,
  detail,
  recording,
  exportCsv
};
