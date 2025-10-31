const express = require('express');
const crypto = require('crypto');
const { Call } = require('../../models/Call');
const { Campaign } = require('../../models/Campaign');
const { User } = require('../../models/User');
const { extractLeadFromTranscript } = require('../../services/leadExtraction');
const { emitToAdmin, emitToInboundUser, emitToOutboundUser } = require('../../services/socketService');
const asyncHandler = require('../../middleware/asyncHandler');

const router = express.Router();

// Verify webhook signature
const verifyWebhookSignature = (payload, signature, secret) => {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
};

// POST /api/webhooks/millis/call-ended
router.post('/call-ended', asyncHandler(async (req, res) => {
  try {
    const signature = req.headers['x-millis-signature'];
    const webhookSecret = process.env.MILLIS_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('MILLIS_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook not configured' });
    }

    // Security: Verify signature is present
    if (!signature) {
      console.error('Missing webhook signature header');
      return res.status(401).json({ error: 'Missing signature' });
    }

    // Verify webhook signature
    const payload = JSON.stringify(req.body);
    if (!verifyWebhookSignature(payload, signature, webhookSecret)) {
      console.error('Invalid webhook signature - possible unauthorized access attempt');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const callData = req.body;
    console.log('Received call-ended webhook:', callData);

    // Extract call information
    const {
      call_id: millisCallId,
      agent_id: agentId,
      phone_from: phoneFrom,
      phone_to: phoneTo,
      duration_seconds: durationSeconds,
      status: callStatus,
      transcript: transcriptData,
      recording_url: recordingUrl,
      campaign_id: millisCampaignId
    } = callData;

    // Determine user_id from phone number or campaign
    let userId;
    let campaignId = null;
    let callType = 'inbound';

    if (millisCampaignId) {
      // Outbound call - find campaign by millis_campaign_id
      const campaign = await Campaign.findOne({ millis_campaign_id: millisCampaignId });
      if (campaign) {
        userId = campaign.user_id;
        campaignId = campaign._id;
        callType = 'outbound';
      }
    } else {
      // Inbound call - find user by phone number
      const user = await User.findOne({
        $or: [
          { 'millis_config.assigned_phone_numbers': { $in: [phoneTo] } },
          { phone: phoneTo }
        ]
      });
      if (user) {
        userId = user._id;
      }
    }

    if (!userId) {
      console.error('Could not determine user for call:', { phoneFrom, phoneTo, millisCampaignId });
      return res.status(400).json({ error: 'User not found' });
    }

    // Create call record
    const call = new Call({
      user_id: userId,
      campaign_id: campaignId,
      type: callType,
      phone_from: phoneFrom,
      phone_to: phoneTo,
      status: callStatus,
      duration_seconds: durationSeconds,
      transcript: {
        full_text: transcriptData?.full_text || '',
        segments: transcriptData?.segments || []
      },
      millis_call_id: millisCallId,
      agent_id: agentId,
      recording_url: recordingUrl,
      lead_extracted: false,
      disposition: null
    });

    await call.save();

    // Emit call:new event immediately after call is created
    const callEventData = {
      call_id: call._id,
      type: callType,
      phone_from: phoneFrom,
      phone_to: phoneTo,
      status: callStatus,
      duration_seconds: durationSeconds,
      created_at: call.created_at
    };

    // Emit to appropriate namespace based on call type
    if (callType === 'inbound') {
      emitToInboundUser(userId.toString(), 'call:new', callEventData);
    } else {
      emitToOutboundUser(userId.toString(), 'call:new', callEventData);
    }
    
    // Emit to admin namespace
    emitToAdmin('call:new', { ...callEventData, user_id: userId });

    // Update user's call minutes used
    if (durationSeconds > 0) {
      await User.findByIdAndUpdate(userId, {
        $inc: { 'subscription.call_minutes_used': Math.ceil(durationSeconds / 60) }
      });
    }

    // Update campaign stats if outbound
    if (campaignId && callType === 'outbound') {
      const updateFields = {
        $inc: { 'stats.calls_made': 1, 'stats.total_duration_seconds': durationSeconds, 'stats.calls_remaining': -1 }
      };

      if (callStatus === 'answered') {
        updateFields.$inc['stats.calls_answered'] = 1;
      }

      await Campaign.findByIdAndUpdate(campaignId, updateFields);
      
      // Update the target_numbers array with call recording and status
      try {
        const campaign = await Campaign.findById(campaignId);
        if (campaign && campaign.target_numbers) {
          // Find the matching record by phone number
          const targetIndex = campaign.target_numbers.findIndex(record => {
            const normalizedRecordPhone = record.phone.toString().replace(/\D/g, '');
            const normalizedPhoneTo = phoneTo.toString().replace(/\D/g, '');
            return normalizedRecordPhone === normalizedPhoneTo;
          });
          
          if (targetIndex !== -1) {
            // Update the record with call details
            campaign.target_numbers[targetIndex].call_status = callStatus;
            
            if (recordingUrl) {
              campaign.target_numbers[targetIndex].call_recording_url = recordingUrl;
              console.log(`✓ Updated call recording URL for ${phoneTo}: ${recordingUrl}`);
            }
            
            if (durationSeconds) {
              campaign.target_numbers[targetIndex].call_duration = durationSeconds;
            }
            
            campaign.target_numbers[targetIndex].call_ended_at = new Date();
            
            // Mark the array as modified and save
            campaign.markModified('target_numbers');
            await campaign.save();
            
            console.log(`✓ Updated campaign record for ${phoneTo} with status ${callStatus}`);
          } else {
            console.warn(`⚠️ Could not find target number ${phoneTo} in campaign ${campaignId}`);
          }
        }
      } catch (campaignUpdateError) {
        console.error('Failed to update campaign target_numbers:', campaignUpdateError);
        // Don't throw - webhook should still succeed
      }
    }

    // Emit call:ended event
    if (callType === 'inbound') {
      emitToInboundUser(userId.toString(), 'call:ended', callEventData);
    } else {
      emitToOutboundUser(userId.toString(), 'call:ended', callEventData);
    }

    // Trigger lead extraction asynchronously (don't wait)
    if (transcriptData?.full_text && transcriptData.full_text.trim()) {
      extractLeadFromTranscript(call._id, transcriptData.full_text)
        .then((lead) => {
          if (lead) {
            // Emit lead:extracted event
            const leadEventData = {
              lead_id: lead._id,
              call_id: call._id,
              contact: lead.contact,
              intent: lead.intent,
              urgency: lead.urgency,
              created_at: lead.created_at
            };
            
            if (callType === 'inbound') {
              emitToInboundUser(userId.toString(), 'lead:extracted', leadEventData);
            } else {
              emitToOutboundUser(userId.toString(), 'lead:extracted', leadEventData);
            }
          }
        })
        .catch(error => {
          console.error('Lead extraction failed:', error);
        });
    }

    console.log(`Call ${call._id} created successfully`);
    res.status(200).json({ success: true, call_id: call._id });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}));

module.exports = router;
