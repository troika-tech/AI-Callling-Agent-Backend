const express = require('express');
const Call = require('../../models/Call');
const User = require('../../models/User');
const asyncHandler = require('../../middleware/asyncHandler');

const router = express.Router();

// Exotel (Twilio-style) webhook for incoming calls
// Mounted at /api/webhooks/exotel
// Exotel typically sends application/x-www-form-urlencoded

router.post('/incoming', asyncHandler(async (req, res) => {
  // Accept both v1 (Twilio-like) and potential v2 JSON
  const payload = { ...req.body };
  console.log('[Exotel Webhook] incoming payload:', payload);

  // Extract common fields (best-effort across variants)
  const callSid = payload.CallSid || payload.CallSid || payload.sid || payload.Sid;
  const from = payload.From || payload.from || payload.CustomerNumber || payload.customer_number || '';
  const to = payload.To || payload.to || payload.AgentNumber || payload.agent_number || '';
  const status = (payload.CallStatus || payload.status || '').toLowerCase() || 'ringing';
  const direction = (payload.Direction || payload.direction || 'incoming').toLowerCase();
  const startedAt = payload.StartTime || payload.start_time || payload.DateCreated || payload.date_created;
  const endedAt = payload.EndTime || payload.end_time || payload.DateUpdated || payload.date_updated;
  const durationSec = Number(payload.Duration || payload.duration || 0);
  const recordingUrl = payload.RecordingUrl || payload.recording_url || '';

  // Determine user by called number ("to")
  let user = null;
  if (to) {
    user = await User.findOne({
      $or: [
        { phone: to },
        { 'millis_config.assigned_phone_numbers': { $in: [to] } }
      ]
    });
  }

  // If user cannot be found, we still accept and noop persist to avoid retries from Exotel
  if (!user) {
    console.warn('[Exotel Webhook] No matching user for number', to);
    return res.status(200).json({ success: true });
  }

  const createdAt = startedAt ? new Date(startedAt) : new Date();

  await Call.updateOne(
    {
      user_id: user._id,
      type: 'inbound',
      millis_call_id: callSid,
      phone_from: from,
      phone_to: to,
      created_at: createdAt,
    },
    {
      $setOnInsert: { user_id: user._id, type: 'inbound' },
      $set: {
        direction: direction === 'outbound' ? 'outgoing' : 'incoming',
        status,
        duration_seconds: durationSec,
        recording_url: recordingUrl || undefined,
        created_at: createdAt,
      }
    },
    { upsert: true }
  );

  return res.status(200).json({ success: true });
}));

module.exports = router;


