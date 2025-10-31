const express = require('express');
const Campaign = require('../../models/Campaign');
const Call = require('../../models/Call');
const Lead = require('../../models/Lead');
const User = require('../../models/User');
const CallerPhone = require('../../models/CallerPhone');
const { requireAuth } = require('../../middleware/auth');
const { uploadCampaignFiles } = require('../../middleware/upload');
const { parseTargetNumbers, generateCsvTemplate } = require('../../services/csvParser');
const { launchCampaign, pauseCampaign, resumeCampaign } = require('../../services/millisCampaignService');
const millis = require('../../clients/millis');
const asyncHandler = require('../../middleware/asyncHandler');
const path = require('path');
const fs = require('fs');
const cfg = require('../../config');
const { Readable } = require('stream');
const createError = require('http-errors');

// Helper function to convert Millis campaign status to local status
function convertMillisStatus(millisStatus) {
  const statusMap = {
    'idle': 'draft',          // Map 'idle' to 'draft'
    'draft': 'draft',
    'pending_approval': 'pending_approval',
    'approved': 'approved',
    'rejected': 'rejected',
    'active': 'active',
    'running': 'running',
    'paused': 'paused',
    'finished': 'completed',
    'completed': 'completed'
  };
  return statusMap[millisStatus?.toLowerCase()] || 'draft';
}

const router = express.Router();

// Apply authentication to all routes
router.use(requireAuth);

// GET /api/v1/outbound/campaigns
router.get('/', asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  
  const query = { user_id: req.user.id };
  if (status) {
    query.status = status;
  }

  const campaigns = await Campaign.find(query)
    .sort({ created_at: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit))
    .select('name status stats created_at launched_at target_numbers millis_campaign_id');

  const totalDocs = await Campaign.countDocuments(query);

  res.status(200).json({
    campaigns: campaigns,
    totalDocs: totalDocs,
    limit: parseInt(limit),
    page: parseInt(page),
    totalPages: Math.ceil(totalDocs / parseInt(limit)),
    hasNextPage: parseInt(page) < Math.ceil(totalDocs / parseInt(limit)),
    nextPage: parseInt(page) < Math.ceil(totalDocs / parseInt(limit)) ? parseInt(page) + 1 : null,
    hasPrevPage: parseInt(page) > 1,
    prevPage: parseInt(page) > 1 ? parseInt(page) - 1 : null,
  });
}));

// POST /api/v1/outbound/campaigns/sync-from-millis
// Sync campaigns from Millis that don't exist locally
router.post('/sync-from-millis', asyncHandler(async (req, res) => {
  try {
    // Fetch all campaigns from Millis
    let millisCampaigns;
    try {
      millisCampaigns = await millis.listCampaigns({ page: 1, pageSize: 100 });
    } catch (millisError) {
      console.error('Failed to fetch campaigns from Millis:', millisError.message);
      console.error('Millis error details:', millisError);
      return res.status(500).json({
        error: 'Failed to connect to Millis API',
        details: millisError.message
      });
    }
    
    // Handle different response formats
    let campaignsList = [];
    if (Array.isArray(millisCampaigns)) {
      campaignsList = millisCampaigns;
    } else if (millisCampaigns.items && Array.isArray(millisCampaigns.items)) {
      campaignsList = millisCampaigns.items;
    } else if (millisCampaigns.campaigns && Array.isArray(millisCampaigns.campaigns)) {
      campaignsList = millisCampaigns.campaigns;
    } else if (millisCampaigns.data && Array.isArray(millisCampaigns.data)) {
      campaignsList = millisCampaigns.data;
    } else {
      return res.status(200).json({
        success: true,
        message: 'No campaigns found in Millis (unexpected response format)',
        campaignsAdded: 0,
        debug: millisCampaigns
      });
    }
    
    if (campaignsList.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No campaigns found in Millis',
        campaignsAdded: 0,
        debug: millisCampaigns
      });
    }

    console.log(`Found ${campaignsList.length} campaigns on Millis`);

    // Get all local campaign IDs
    const localCampaigns = await Campaign.find({ user_id: req.user.id });
    const localMillisIds = new Set(localCampaigns
      .map(c => c.millis_campaign_id)
      .filter(id => id));

    let campaignsAdded = 0;

    // Process each Millis campaign
    for (const millisCampaign of campaignsList) {
      const millisId = millisCampaign.id || millisCampaign._id || millisCampaign.campaign_id;
      
      // Skip if campaign already exists locally
      if (localMillisIds.has(millisId)) {
        continue;
      }

      // Map records from Millis format
      let targetNumbers = [];
      if (millisCampaign.records && Array.isArray(millisCampaign.records)) {
        targetNumbers = millisCampaign.records.map(record => ({
          phone: record.phone,
          name: record.name || '',
          metadata: record.metadata || {}
        }));
      } else if (millisCampaign.target_numbers && Array.isArray(millisCampaign.target_numbers)) {
        targetNumbers = millisCampaign.target_numbers.map(phone => ({
          phone: typeof phone === 'string' ? phone : (phone.phone || phone),
          name: phone.name || '',
          metadata: phone.metadata || {}
        }));
      }

      // Create local campaign from Millis data
      const localCampaign = new Campaign({
        user_id: req.user.id,
        name: millisCampaign.name,
        description: millisCampaign.description || '',
        status: convertMillisStatus(millisCampaign.status || 'draft'),
        millis_campaign_id: millisId,
        assigned_phone_number: millisCampaign.caller || '',
        target_numbers: targetNumbers,
        stats: {
          total_numbers: targetNumbers.length,
          calls_made: 0,
          calls_answered: 0,
          calls_no_answer: 0,
          calls_busy: 0,
          calls_failed: 0,
          calls_remaining: targetNumbers.length,
          total_duration_seconds: 0,
          conversions: 0,
          total_cost: 0
        },
        created_at: millisCampaign.created_at ? new Date(millisCampaign.created_at) : new Date(),
        launched_at: millisCampaign.launched_at ? new Date(millisCampaign.launched_at) : null
      });

      await localCampaign.save();
      campaignsAdded++;
    }


    res.status(200).json({
      success: true,
      message: 'Campaigns synced successfully from Millis',
      campaignsAdded,
      totalMillisCampaigns: campaignsList.length,
      totalLocalCampaigns: localCampaigns.length
    });

  } catch (millisError) {
    console.error('❌ Failed to sync campaigns from Millis');
    console.error('Error message:', millisError.message);
    console.error('Error type:', millisError.name);
    console.error('Full error:', millisError);
    
    if (millisError.response) {
      console.error('Response status:', millisError.response.status);
      console.error('Response data:', millisError.response.data);
    } else if (millisError.request) {
      console.error('No response received. Request config:', millisError.request);
    } else {
      console.error('Error setting up request:', millisError.message);
    }
    
    return res.status(500).json({ 
      error: 'Failed to sync campaigns from Millis',
      details: millisError.message,
      errorType: millisError.name,
      stack: process.env.NODE_ENV === 'development' ? millisError.stack : undefined
    });
  }
}));

// GET /api/v1/outbound/campaigns/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({ 
    _id: req.params.id, 
    user_id: req.user.id 
  });

  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found or unauthorized' });
  }

  // If campaign has millis_campaign_id, sync caller phone from Millis
  if (campaign.millis_campaign_id) {
    try {
      // Try to get campaign info first (has caller field), then fallback to detail
      let millisCampaignInfo = null;
      let millisCampaign = null;
      
      try {
        millisCampaignInfo = await millis.getCampaignInfo(campaign.millis_campaign_id);
      } catch (infoError) {
        console.warn('Could not fetch campaign info in GET /:id, trying detail:', infoError.message);
      }
      
      // Also try detail endpoint as fallback
      try {
        millisCampaign = await millis.getCampaignDetail(campaign.millis_campaign_id);
      } catch (detailError) {
        console.warn('Could not fetch campaign detail in GET /:id:', detailError.message);
      }
      
      // Use info endpoint data first (has caller field), then fallback to detail
      const campaignData = millisCampaignInfo || millisCampaign;
      
      // Check multiple possible field names for caller phone
      const millisCallerPhone = campaignData?.caller || 
                                campaignData?.caller_phone || 
                                campaignData?.phone_number || 
                                campaignData?.caller_number ||
                                campaignData?.assigned_phone_number ||
                                (campaignData?.phone && typeof campaignData.phone === 'string' ? campaignData.phone : null);
      
      // Log for debugging
      if (campaignData) {
        console.log(`📞 GET /:id - Millis campaign caller fields:`, {
          source: millisCampaignInfo ? 'info endpoint' : 'detail endpoint',
          caller: campaignData.caller,
          caller_phone: campaignData.caller_phone,
          phone_number: campaignData.phone_number,
          extracted: millisCallerPhone
        });
      }
      
      if (millisCallerPhone) {
        // Normalize phone numbers for comparison
        const normalizePhone = (phone) => {
          if (!phone) return '';
          return phone.toString().replace(/\s+/g, '').replace(/-/g, '').trim();
        };
        
        const normalizedMillisPhone = normalizePhone(millisCallerPhone);
        const normalizedLocalPhone = normalizePhone(campaign.assigned_phone_number);
        
        if (normalizedMillisPhone && normalizedMillisPhone !== normalizedLocalPhone) {
          console.log(`📞 Syncing caller phone from Millis in GET /:id: ${millisCallerPhone} (was: ${campaign.assigned_phone_number || 'not set'})`);
          campaign.assigned_phone_number = millisCallerPhone;
          
          // Update CallerPhone record if it exists
          try {
            const existingCallerPhone = await CallerPhone.findOne({
              campaign_id: campaign._id,
              is_active: true
            });
            
            if (existingCallerPhone) {
              existingCallerPhone.caller_number = millisCallerPhone;
              existingCallerPhone.caller_status = 'live';
              await existingCallerPhone.save();
              console.log(`✓ Updated CallerPhone record in GET /:id`);
            } else if (campaign.user_id) {
              // Create new CallerPhone record
              const newCallerPhone = new CallerPhone({
                user_id: campaign.user_id,
                campaign_id: campaign._id,
                caller_number: millisCallerPhone,
                caller_status: 'live',
                is_active: true,
                objectid: `millis_${Date.now()}`, // Required field
                metadata: {
                  synced_from_millis: true,
                  synced_at: new Date()
                }
              });
              await newCallerPhone.save();
              console.log(`✓ Created new CallerPhone record in GET /:id`);
            }
            
            await campaign.save();
            console.log(`✓ Caller phone synced from Millis in campaign detail`);
          } catch (callerPhoneError) {
            console.warn('Could not update CallerPhone record in GET /:id:', callerPhoneError.message);
            // Still save campaign update
            await campaign.save();
          }
        } else {
          console.log(`✓ Caller phone already matches: ${millisCallerPhone}`);
        }
      } else {
        console.log(`⚠️ No caller phone found in Millis campaign in GET /:id`);
      }
    } catch (millisError) {
      console.warn('Could not fetch campaign from Millis in GET /:id:', millisError.message);
      // Continue and return local campaign data
    }
  }

  res.status(200).json(campaign);
}));

// POST /api/v1/outbound/campaigns
router.post('/', uploadCampaignFiles, asyncHandler(async (req, res) => {
  const { name, description, schedule } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Campaign name is required' });
  }

  if (!req.body.target_numbers || !Array.isArray(req.body.target_numbers) || req.body.target_numbers.length === 0) {
    return res.status(400).json({ error: 'Target numbers are required' });
  }

  // Parse target numbers from CSV if provided
  let targetNumbers = [];
  if (req.files && req.files.target_numbers_csv) {
    const csvFile = req.files.target_numbers_csv[0];
    try {
      const parsedNumbers = await parseTargetNumbers(csvFile.path);
      targetNumbers = parsedNumbers.filter(item => item.isValid);
      
      if (targetNumbers.length === 0) {
        return res.status(400).json({ error: 'No valid phone numbers found in CSV file' });
      }
    } catch (error) {
      return res.status(400).json({ error: `CSV parsing error: ${error.message}` });
    }
  }

  // Parse target numbers from request body if provided
  if (req.body.target_numbers && Array.isArray(req.body.target_numbers)) {
    targetNumbers = req.body.target_numbers.map(num => ({
      phone: num.phone || num,
      name: num.name || '',
      metadata: num.metadata || {}
    }));
  }

  // Process knowledge base files
  let kbFiles = [];
  if (req.files && req.files.kb_files) {
    kbFiles = req.files.kb_files.map(file => ({
      filename: file.filename,
      url: file.path, // Store local path for now
      size: file.size,
      uploaded_at: new Date()
    }));
  }

  // Parse schedule if provided
  let scheduleData = {};
  if (schedule) {
    try {
      scheduleData = JSON.parse(schedule);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid schedule format' });
    }
  }

  // Create campaign with status 'draft' (not started yet)
  const campaign = new Campaign({
    user_id: req.user.id,
    name,
    description,
    target_numbers: targetNumbers,
    knowledge_base_files: kbFiles,
    schedule: scheduleData,
    status: 'draft', // Start as 'draft' - campaign not started until user manually starts it
    stats: {
      total_numbers: targetNumbers.length,
      calls_made: 0,
      calls_answered: 0,
      calls_remaining: targetNumbers.length,
      total_duration_seconds: 0
    }
  });

  await campaign.save();

  // Automatically send campaign to Millis for processing
  // Note: Creating on Millis doesn't mean it's started - status remains 'draft' until user clicks Start
  try {
    
    // Prepare campaign data for Millis
    const millisCampaignData = {
      name: campaign.name,
      description: campaign.description,
      target_numbers: campaign.target_numbers.map(num => num.phone),
      schedule: campaign.schedule,
      max_concurrent_calls: campaign.schedule?.call_frequency?.max_concurrent_calls || 3,
      calls_per_hour: campaign.schedule?.call_frequency?.calls_per_hour || 10,
      // Add default agent and phone if not specified
      agent_id: 'default_agent', // You may want to get this from user settings
      phone_number: 'default_phone' // You may want to get this from user settings
    };

    // Send to Millis API
    const millisClient = require('../../clients/millis');
    const millisResponse = await millisClient.axios.post('/campaigns', millisCampaignData);
    
    if (millisResponse.data && millisResponse.data.id) {
      // Update campaign with Millis ID but keep status as 'draft' (not started yet)
      // Status will change to 'active' only when user manually clicks Start button
      campaign.millis_campaign_id = millisResponse.data.id;
      // Don't change status here - keep it as 'draft' until user manually starts it
      campaign.status = 'draft'; // Keep as 'draft' - campaign not started yet
      campaign.millis_integration_status = 'success';
      await campaign.save();
      
      
      // Add records to the Millis campaign
      try {
        
        const recordsData = campaign.target_numbers.map(num => ({
          phone: num.phone,
          metadata: num.metadata || {}
        }));
        
        const recordsResponse = await millisClient.axios.post(
          `/campaigns/${millisResponse.data.id}/records`,
          recordsData
        );
        
        
      } catch (recordsError) {
        console.error(`Failed to add records to Millis campaign:`, recordsError.message);
        // Don't fail the entire process if records upload fails
        campaign.millis_integration_status = 'partial_success';
        campaign.millis_error = `Campaign created but records upload failed: ${recordsError.message}`;
        await campaign.save();
      }
      
    } else {
      throw new Error('Invalid response from Millis API');
    }
  } catch (millisError) {
    console.error(`Failed to send campaign ${campaign.name} to Millis:`, millisError.message);
    console.error('Millis error details:', millisError.response?.data || millisError.message);
    
    // Keep campaign as 'draft' if Millis fails (not started yet)
    // Add a field to track Millis integration status
    campaign.millis_integration_status = 'failed';
    campaign.millis_error = millisError.message;
    campaign.status = 'draft'; // Ensure status remains 'draft' if Millis fails
    await campaign.save();
    
    // Still return success to user, but log the Millis failure
  }

  res.status(201).json(campaign);
}));

// PATCH /api/v1/outbound/campaigns/:id
router.patch('/:id', asyncHandler(async (req, res) => {
  const { name, description, schedule } = req.body;

  const campaign = await Campaign.findOne({ 
    _id: req.params.id, 
    user_id: req.user.id 
  });

  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found or unauthorized' });
  }

  // Only allow updates if status is 'draft' or 'approved'
  if (!['draft', 'approved'].includes(campaign.status)) {
    return res.status(400).json({ error: 'Campaign cannot be updated in current status' });
  }

  if (name) campaign.name = name;
  if (description) campaign.description = description;
  if (schedule) {
    try {
      campaign.schedule = JSON.parse(schedule);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid schedule format' });
    }
  }

  await campaign.save();

  res.status(200).json(campaign);
}));

// DELETE /api/v1/outbound/campaigns/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({ 
    _id: req.params.id, 
    user_id: req.user.id 
  });

  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found or unauthorized' });
  }

  // Only allow deletion if status is 'draft'
  if (campaign.status !== 'draft') {
    return res.status(400).json({ error: 'Only draft campaigns can be deleted' });
  }

  // Delete associated files
  if (campaign.knowledge_base_files && campaign.knowledge_base_files.length > 0) {
    campaign.knowledge_base_files.forEach(file => {
      if (fs.existsSync(file.url)) {
        fs.unlinkSync(file.url);
      }
    });
  }

  await Campaign.findByIdAndDelete(req.params.id);

  res.status(204).send();
}));

// POST /api/v1/outbound/campaigns/:id/pause
router.post('/:id/pause', asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({ 
    _id: req.params.id, 
    user_id: req.user.id 
  });

  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found or unauthorized' });
  }

  // Allow pausing campaigns that are active or running
  if (!['active', 'running'].includes(campaign.status)) {
    return res.status(400).json({ 
      error: `Campaign cannot be paused. Current status: ${campaign.status}`,
      currentStatus: campaign.status 
    });
  }

  // Try to call Millis API to pause campaign (but don't fail if it doesn't have millis_campaign_id)
  if (campaign.millis_campaign_id) {
    try {
      // First check campaign status on Millis
      const millisCampaignDetail = await millis.axios.get(`/campaigns/${campaign.millis_campaign_id}`);
      const millisStatus = millisCampaignDetail.data?.status;
      
      if (millisStatus === 'finished' || millisStatus === 'completed') {
        console.log(`Campaign ${campaign.name} is already ${millisStatus} on Millis. Updating local status to completed.`);
        campaign.status = 'completed';
      } else {
        console.log(`Pausing campaign ${campaign.name} in Millis (current status: ${millisStatus})...`);
        await pauseCampaign(campaign.millis_campaign_id);
        console.log(`Campaign ${campaign.name} paused in Millis`);
        campaign.status = 'paused';
      }
    } catch (error) {
      console.error('Failed to pause campaign in Millis (continuing anyway):', error.message);
      // Check if error is because campaign is finished
      const errorDetail = error.response?.data?.detail || '';
      if (errorDetail.includes('already finished') || errorDetail.includes('already processed')) {
        console.log('Campaign is finished on Millis. Setting local status to completed.');
        campaign.status = 'completed';
      } else {
        campaign.status = 'paused';
      }
    }
  } else {
    console.log('Campaign has no millis_campaign_id, pausing locally only');
    campaign.status = 'paused';
  }

  await campaign.save();

  console.log(`Campaign ${campaign.name} status updated to ${campaign.status}`);

  res.status(200).json({ 
    success: true,
    campaign,
    message: 'Campaign paused successfully' 
  });
}));

// POST /api/v1/outbound/campaigns/:id/resume
router.post('/:id/resume', asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({ 
    _id: req.params.id, 
    user_id: req.user.id 
  });

  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found or unauthorized' });
  }

  if (campaign.status !== 'paused') {
    return res.status(400).json({ error: 'Only paused campaigns can be resumed' });
  }

  // Call Millis API to resume campaign
  if (campaign.millis_campaign_id) {
    try {
      await resumeCampaign(campaign.millis_campaign_id);
    } catch (error) {
      console.error('Failed to resume campaign in Millis:', error);
      return res.status(500).json({ error: 'Failed to resume campaign' });
    }
  }

  campaign.status = 'active';
  await campaign.save();

  res.status(200).json(campaign);
}));

// POST /api/v1/outbound/campaigns/:id/launch
router.post('/:id/launch', asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({ 
    _id: req.params.id, 
    user_id: req.user.id 
  });

  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found or unauthorized' });
  }

  // Allow re-launching active campaigns
  // Just update the campaign status and try to launch again
  // No need to block based on status

  // Ensure campaign has required fields for launch
  if (!campaign.schedule || !campaign.schedule.start_date) {
    // Set default schedule if not present
    // Use markModified to tell Mongoose we're updating a nested object
    campaign.schedule = campaign.schedule || {};
    campaign.schedule.start_date = new Date();
    campaign.schedule.end_date = campaign.schedule.end_date || null;
    campaign.schedule.timezone = campaign.schedule.timezone || 'UTC';
    campaign.schedule.call_frequency = campaign.schedule.call_frequency || {
      calls_per_hour: 10,
      max_concurrent_calls: 3
    };
    campaign.markModified('schedule');
  }

  // Fix invalid campaign status values if they exist
  const validStatuses = ['draft', 'pending_approval', 'approved', 'rejected', 'active', 'paused', 'completed'];
  if (campaign.status && !validStatuses.includes(campaign.status)) {
    console.log(`Fixing invalid campaign.status: ${campaign.status} -> active`);
    campaign.status = 'active';
  }

  // Fix invalid approval.status values if they exist
  if (campaign.approval && campaign.approval.status && !['pending', 'approved', 'rejected'].includes(campaign.approval.status)) {
    console.log(`Fixing invalid approval.status: ${campaign.approval.status} -> pending`);
    campaign.approval.status = 'pending';
    campaign.markModified('approval');
  }

  // Fetch caller phone to populate agent_id and phone number
  const callerPhone = await CallerPhone.findOne({
    campaign_id: campaign._id,
    is_active: true
  });

  // If caller phone exists, populate campaign fields
  if (callerPhone) {
    campaign.assigned_phone_number = callerPhone.caller_number;
    // TODO: Get agent_id from caller phone's agent association
    // For now, use a default agent ID or get from user's config
    const user = await User.findById(req.user.id);
    if (user && user.millis_config && user.millis_config.assigned_agents && user.millis_config.assigned_agents.length > 0) {
      campaign.assigned_agent_id = user.millis_config.assigned_agents[0];
    } else {
      campaign.assigned_agent_id = 'default_agent';
    }
  }

  // Note: Removed user minutes check for now to allow testing
  // Check user has sufficient call minutes
  // const user = await User.findById(req.user.id);
  // const estimatedMinutes = campaign.stats.total_numbers * 2; // Estimate 2 minutes per call
  // 
  // if (user.subscription.call_minutes_used + estimatedMinutes > user.subscription.call_minutes_allocated) {
  //   return res.status(400).json({ error: 'Insufficient call minutes to launch campaign' });
  // }

  // Call Millis API to launch campaign
  try {
    let millisCampaignId = campaign.millis_campaign_id;
    
    // If campaign doesn't have a Millis ID, try to find it on Millis first
    if (!millisCampaignId) {
      console.log(`No millis_campaign_id found, looking for existing campaign on Millis...`);
      
      try {
        const millisCampaigns = await millis.listCampaigns({ page: 1, pageSize: 100 });
        const foundCampaign = millisCampaigns.items?.find(c => c.name === campaign.name);
        
        if (foundCampaign && foundCampaign.id) {
          millisCampaignId = foundCampaign.id;
          console.log(`✓ Found existing campaign on Millis with ID: ${millisCampaignId}`);
        } else {
          // Only create new campaign if it doesn't exist
          console.log(`Campaign not found on Millis, creating new one...`);
          millisCampaignId = await launchCampaign(campaign);
          console.log(`✓ Created new campaign on Millis with ID: ${millisCampaignId}`);
        }
      } catch (lookupError) {
        console.error('Failed to lookup campaign on Millis:', lookupError.message);
        // Fall back to creating a new campaign
        console.log('Falling back to creating new campaign...');
        millisCampaignId = await launchCampaign(campaign);
      }
    } else {
      console.log(`Campaign already has millis_campaign_id: ${millisCampaignId}. Reusing existing campaign.`);
    }
    
    campaign.millis_campaign_id = millisCampaignId;
    await campaign.save(); // Save the millis_campaign_id immediately
    
    // Check campaign status on Millis first and validate the campaign exists
    let millisCampaignStatus = null;
    let validMillisCampaign = true;
    let needNewCampaign = false;
    
    try {
      const millisCampaignDetail = await millis.axios.get(`/campaigns/${millisCampaignId}`);
      millisCampaignStatus = millisCampaignDetail.data?.status;
      console.log(`✓ Millis campaign ${millisCampaignId} is valid, status: ${millisCampaignStatus}`);
      
      // If campaign is finished on Millis, we need to create a new one
      if (millisCampaignStatus === 'finished' || millisCampaignStatus === 'completed') {
        console.log(`⚠ Campaign ${millisCampaignId} is ${millisCampaignStatus} on Millis. Creating new campaign for restart...`);
        needNewCampaign = true;
      }
    } catch (detailError) {
      console.warn('Could not get Millis campaign details:', detailError.message);
      
      // Check if campaign doesn't exist (404/400 with "not found" message)
      if (detailError.response?.status === 404 || detailError.response?.status === 400) {
        const errorDetail = detailError.response?.data?.detail || '';
        if (errorDetail.includes('not found') || errorDetail.includes('Not Found') || errorDetail.toLowerCase().includes('campaign not found')) {
          console.warn(`✗ Millis campaign ${millisCampaignId} not found. Invalidating and re-creating...`);
          needNewCampaign = true;
        }
      }
    }
    
    // If we need a new campaign (finished or not found), create one
    if (needNewCampaign) {
      try {
        console.log('Creating new campaign on Millis for restart...');
        millisCampaignId = await launchCampaign(campaign);
        console.log(`✓ Created new Millis campaign: ${millisCampaignId}`);
        campaign.millis_campaign_id = millisCampaignId;
        await campaign.save();
        validMillisCampaign = true;
        millisCampaignStatus = 'idle'; // New campaigns start as idle
      } catch (createError) {
        console.error('Failed to create new campaign on Millis:', createError.message);
        validMillisCampaign = false;
      }
    }
    
    // Only proceed if we have a valid Millis campaign
    if (!validMillisCampaign || !millisCampaignId) {
      console.warn('No valid Millis campaign available. Skipping Millis operations but updating local status.');
    } else {
      // For NEW campaigns, we MUST set caller, add records, and start
      // For existing campaigns, we can skip if operations fail
      const isNewCampaign = needNewCampaign;
      
      // Try to set caller phone and agent
      let callerAndAgentConfigured = false;
      if (campaign.assigned_phone_number) {
        try {
          console.log(`Setting caller phone on Millis campaign...`);
          const callerResponse = await millis.axios.post(`/campaigns/${millisCampaignId}/set_caller`, {
            caller: campaign.assigned_phone_number
          });
          console.log('✓ Caller phone set on Millis');
          callerAndAgentConfigured = true;
        } catch (callerError) {
          console.warn('Failed to set caller on Millis:', callerError.message);
          if (callerError.response) {
            console.error('Caller error details:', callerError.response.data);
          }
          // For new campaigns, this is critical - don't proceed
          if (isNewCampaign) {
            console.error('Cannot configure new campaign without caller. Aborting.');
            return res.status(500).json({ error: 'Failed to configure campaign caller on Millis' });
          }
        }
      }
      
      // Try to set agent for the campaign
      if (callerAndAgentConfigured || isNewCampaign) {
        // Get the agent ID from the campaign or user's assigned agents
        let agentId = campaign.assigned_agent_id;
        
        if (!agentId) {
          // Try to get agent from caller phone's linked agent
          const CallerPhone = require('../models/CallerPhone');
          const VoiceAgent = require('../models/VoiceAgent');
          
          const callerPhone = await CallerPhone.findOne({
            campaign_id: campaign._id,
            is_active: true
          });
          
          if (callerPhone && callerPhone.caller_number) {
            // Find voice agent linked to this phone number
            const ExotelPhone = require('../models/ExotelPhone');
            const exotelPhone = await ExotelPhone.findOne({
              phone_number: callerPhone.caller_number
            });
            
            if (exotelPhone && exotelPhone.linked_agent_id) {
              const voiceAgent = await VoiceAgent.findById(exotelPhone.linked_agent_id);
              if (voiceAgent && voiceAgent.millis_agent_id) {
                agentId = voiceAgent.millis_agent_id;
                console.log(`Found agent ${agentId} linked to caller phone`);
              }
            }
          }
        }
        
        // Set agent if we found one
        if (agentId) {
          try {
            console.log(`Setting agent ${agentId} for Millis campaign...`);
            await millis.axios.post(`/campaigns/${millisCampaignId}/set_agent`, {
              agent_id: agentId
            });
            console.log('✓ Agent set on Millis campaign');
          } catch (agentError) {
            console.warn('Failed to set agent on Millis:', agentError.message);
            if (agentError.response) {
              console.error('Agent error details:', agentError.response.data);
            }
          }
        } else {
          console.warn('No agent ID found for campaign');
        }
      }
      
      // Add campaign records (target numbers) to Millis campaign
      // Do this regardless of caller setup for new campaigns
      if (campaign.target_numbers && campaign.target_numbers.length > 0) {
        try {
          // Filter out the caller phone from target numbers (it's marked with metadata.is_caller)
          const records = campaign.target_numbers
            .filter(num => !num.metadata?.is_caller)
            .map(num => ({
              phone: num.phone,
              metadata: num.metadata || {}
            }));
          
          if (records.length > 0) {
            console.log(`Adding ${records.length} records to Millis campaign:`, JSON.stringify(records, null, 2));
            const recordsResponse = await millis.axios.post(`/campaigns/${millisCampaignId}/records`, records);
            console.log('✓ Campaign records added to Millis:', recordsResponse.data);
          } else {
            console.warn('No target records to add (all numbers are caller phones)');
          }
        } catch (recordsError) {
          console.warn('Failed to add records to Millis:', recordsError.message);
          if (recordsError.response) {
            console.error('Records error details:', recordsError.response.data);
          }
        }
      }
      
      // Start the campaign on Millis
      try {
        console.log(`Starting campaign on Millis: ${millisCampaignId}...`);
        
        // Try to start the campaign on Millis
        const startResponse = await millis.axios.post(`/campaigns/${millisCampaignId}/start`);
        console.log('✓ Campaign started successfully on Millis:', startResponse.data);
      } catch (startError) {
        console.error('Failed to start campaign on Millis:', startError.message);
        
        // Log detailed error information
        if (startError.response) {
          console.error('Millis start error response status:', startError.response.status);
          console.error('Millis start error response data:', startError.response.data);
        }
        
        // Maybe the campaign needs to be launched instead of started
        // Try launch endpoint as fallback
        try {
          console.log('Trying launch endpoint instead...');
          await millis.axios.post(`/campaigns/${millisCampaignId}/launch`);
          console.log('✓ Campaign launched successfully on Millis');
        } catch (launchError) {
          console.error('Failed to launch campaign on Millis:', launchError.message);
          if (launchError.response) {
            console.error('Millis launch error response status:', launchError.response.status);
            console.error('Millis launch error response data:', launchError.response.data);
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to launch campaign in Millis:', error);
    return res.status(500).json({ error: 'Failed to launch campaign' });
  }

  campaign.status = 'active';
  campaign.launched_at = new Date();
  await campaign.save();

  res.status(200).json(campaign);
}));

// GET /api/v1/outbound/campaigns/template/csv
router.get('/template/csv', asyncHandler(async (req, res) => {
  const csvTemplate = generateCsvTemplate();
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="campaign_template.csv"');
  res.send(csvTemplate);
}));

// PUT /api/v1/outbound/campaigns/:id/caller-phone
router.put('/:id/caller-phone', asyncHandler(async (req, res) => {
  const { caller_phone } = req.body;

  if (!caller_phone) {
    return res.status(400).json({ error: 'Caller phone number is required' });
  }

  const campaign = await Campaign.findOne({ 
    _id: req.params.id, 
    user_id: req.user.id 
  });

  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found or unauthorized' });
  }

  // Update the assigned phone number
  campaign.assigned_phone_number = caller_phone;
  
  // Also add the caller phone as a campaign record if it doesn't exist
  const existingRecord = campaign.target_numbers.find(record => record.phone === caller_phone);
  if (!existingRecord) {
    campaign.target_numbers.push({
      phone: caller_phone,
      name: 'Caller Phone',
      metadata: {
        type: 'caller_phone',
        added_at: new Date(),
        is_caller: true
      }
    });
  }
  
  await campaign.save();

  console.log(`Campaign ${campaign.name} caller phone updated to: ${caller_phone}`);

  // Automatically sync caller phone to Millis dashboard
  if (campaign.millis_campaign_id) {
    try {
      console.log('Syncing caller phone to Millis dashboard...');
      
      // Call Millis API to set the caller phone for the campaign
      const setCallerPayload = {
        caller: caller_phone
      };

      const millisResponse = await millis.axios.post(
        `/campaigns/${campaign.millis_campaign_id}/set_caller`,
        setCallerPayload
      );

      console.log('Millis caller phone set successfully:', millisResponse.data);
    } catch (millisError) {
      // Don't fail the main operation if Millis sync fails
      const errorDetails = millisError.response?.data || millisError.message;
      const errorDetail = typeof errorDetails === 'object' ? errorDetails.detail || errorDetails : errorDetails;
      
      // Check if it's a known recoverable error
      if (millisError.response?.status === 404 || errorDetail?.includes('Invalid') || errorDetail?.includes('not found')) {
        console.warn(`Phone ${caller_phone} not found in Millis database - skipping sync. This is normal if the phone hasn't been imported yet.`);
      } else {
        console.error('Failed to sync caller phone to Millis dashboard:', millisError.message);
        console.error('Millis error details:', errorDetail);
      }
      // Continue without throwing error to maintain existing functionality
    }
  } else {
    console.log('No millis_campaign_id found, skipping Millis sync');
  }

  res.status(200).json({
    success: true,
    message: 'Caller phone updated successfully',
    campaign: {
      id: campaign._id,
      name: campaign.name,
      assigned_phone_number: campaign.assigned_phone_number,
      target_numbers: campaign.target_numbers
    }
  });
}));

// GET /api/v1/outbound/campaigns/:id/sync-records
// Sync campaign records from Millis to local database
router.get('/:id/sync-records', asyncHandler(async (req, res) => {
  const campaign = await Campaign.findOne({ 
    _id: req.params.id, 
    user_id: req.user.id 
  });

  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found or unauthorized' });
  }

  // IMPORTANT: Only sync recordings if campaign has been started (has millis_campaign_id)
  // New/unstarted campaigns should NOT fetch recordings from other campaigns
  if (!campaign.millis_campaign_id) {
    return res.status(200).json({
      success: true,
      message: 'Campaign has not been started yet. Please launch the campaign first to sync recordings.',
      localCount: campaign.target_numbers.length,
      millisCount: 0,
      statusUpdates: 0,
      recordingUpdates: 0,
      campaignStatus: campaign.status,
      millisCampaignId: null
    });
  }

  try {
    // Ensure target_numbers is initialized
    if (!campaign.target_numbers) {
      campaign.target_numbers = [];
    }
    
    // First, fetch call logs from Millis to get recordings
    let callLogsWithRecordings = [];
    try {
      // Fetching call logs to get recordings with correct session IDs
      // Fetch call logs with pagination (Millis API limit is 100)
      let allCallLogs = [];
      let page = 1;
      const pageSize = 100; // Max allowed by Millis API
      let hasMorePages = true;
      
      while (hasMorePages && page <= 10) { // Limit to 10 pages (1000 records max)
        let millisCallLogs;
        try {
          millisCallLogs = await millis.listCallLogs({ 
            page: page,
            limit: pageSize
          });
        } catch (logError) {
          console.error(`❌ Failed to fetch call logs page ${page}:`, logError.message);
          // Continue without this page
          hasMorePages = false;
          break;
        }
        
        const logsArray = millisCallLogs?.items || millisCallLogs?.histories || [];
        if (Array.isArray(logsArray)) {
          allCallLogs = allCallLogs.concat(logsArray);
        }
        
        // Check if there are more pages
        hasMorePages = logsArray.length === pageSize;
        page++;
        
        // Add small delay to avoid rate limiting
        if (hasMorePages) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Filter call logs by campaign ID if available
      // Only process call logs that belong to this specific campaign
      const campaignMillisId = campaign.millis_campaign_id;
      let filteredCallLogs = allCallLogs;
      
      if (campaignMillisId) {
        filteredCallLogs = allCallLogs.filter(log => {
          // Check if log has campaign_id and it matches our campaign
          const logCampaignId = log.campaign_id || log.campaignId || log.campaign || null;
          if (logCampaignId) {
            const matches = logCampaignId === campaignMillisId || logCampaignId.toString() === campaignMillisId.toString();
            return matches;
          }
          // If log doesn't have campaign_id, we can't be sure it belongs to this campaign
          // So we'll exclude it unless we can match by agent_id or other metadata
          // For now, we'll only include logs with matching campaign_id
          return false;
        });
        
        // If no filtered logs found, try to match by agent/phone for outbound calls
        // This is a fallback in case campaign_id is not set in call logs
        if (filteredCallLogs.length === 0 && campaign.assigned_phone_number) {
          filteredCallLogs = allCallLogs.filter(log => {
            // Match outbound calls where "from" matches our campaign's caller phone
            if (log.voip && log.voip.from && log.voip.direction === 'outbound') {
              const fromPhone = log.voip.from.toString().replace(/\D/g, '');
              const callerPhone = campaign.assigned_phone_number.toString().replace(/\D/g, '');
              const matches = fromPhone === callerPhone || fromPhone.includes(callerPhone) || callerPhone.includes(fromPhone);
              return matches;
            }
            return false;
          });
        }
      } else {
        // If campaign hasn't been started, don't assign recordings from other campaigns
        filteredCallLogs = [];
      }
      
      // Process filtered call logs to extract recordings by phone number
      for (const log of filteredCallLogs) {
        if (log.voip && log.voip.to) {
          // Extract phone number from "to" field (format: +1234567890)
          const phoneTo = log.voip.to.toString();
          const sessionId = log.session_id || log.id;
          
          // Additional check: only include calls to phone numbers that are in this campaign's target_numbers
          const normalizedPhoneTo = phoneTo.toString().replace(/\D/g, '');
          const campaignPhones = campaign.target_numbers
            .filter(r => r && r.phone) // Filter out null/undefined records or phones
            .map(r => r.phone.toString().replace(/\D/g, ''));
          const phoneMatches = campaignPhones.some(cp => {
            const normalizedCp = cp.replace(/\D/g, '');
            // Only use slice(-10) if both strings are long enough
            if (normalizedPhoneTo === normalizedCp) return true;
            if (normalizedCp.length >= 10 && normalizedPhoneTo.includes(normalizedCp.slice(-10))) return true;
            if (normalizedPhoneTo.length >= 10 && normalizedCp.includes(normalizedPhoneTo.slice(-10))) return true;
            return false;
          });
          
          if (!phoneMatches) {
            // Skip this call log - phone number not in this campaign
            continue;
          }
          
          // Construct recording URL from session ID
          const backendUrl = process.env.BACKEND_URL || `http://localhost:${cfg.port}`;
          const recordingUrl = sessionId ? `${backendUrl}/api/v1/calls/${sessionId}/recording` : null;
          
          if (recordingUrl) {
            callLogsWithRecordings.push({
              phone: phoneTo,
              call_status: log.call_status || 'unknown',
              recording_url: recordingUrl,
              duration: log.duration,
              started_at: log.ts ? new Date(log.ts * 1000) : null,
              ended_at: log.ts && log.duration ? new Date((log.ts + log.duration) * 1000) : null,
              session_id: sessionId,
              campaign_id: log.campaign_id || log.campaignId || log.campaign || null
            });
          }
        }
      }
    } catch (callLogsError) {
      console.warn('❌ Could not fetch call logs from Millis:', callLogsError.message);
      console.warn('Error details:', callLogsError);
      // Continue with campaign sync even if call logs fail
    }
    
    // Create recordings map from call logs FIRST (this is our primary source)
    const recordingsMap = new Map();
    
    for (const logRecord of callLogsWithRecordings) {
      // Skip if phone is null/undefined
      if (!logRecord.phone) {
        console.warn('⚠️ Skipping log record with missing phone:', logRecord.session_id);
        continue;
      }
      const normalizedPhone = logRecord.phone.toString().replace(/\D/g, '');
      // Keep the most recent recording for each phone (prioritize by ended_at timestamp)
      if (!recordingsMap.has(normalizedPhone)) {
        recordingsMap.set(normalizedPhone, logRecord);
      } else {
        const existing = recordingsMap.get(normalizedPhone);
        // If new record has a timestamp and is more recent, use it
        if (logRecord.ended_at && (!existing.ended_at || new Date(logRecord.ended_at) > new Date(existing.ended_at))) {
          recordingsMap.set(normalizedPhone, logRecord);
        }
      }
    }
    
    // Fetch campaign details from Millis (optional - use as fallback)
    let millisCampaign = null;
    let millisCampaignInfo = null; // Also fetch /info endpoint which may have caller phone
    let millisRecords = [];
    let millisRecordsMap = new Map();
    
    try {
      // Try to get campaign detail (main endpoint)
      millisCampaign = await millis.getCampaignDetail(campaign.millis_campaign_id);
      
      // Also try to get campaign info (info endpoint may have caller phone)
      try {
        millisCampaignInfo = await millis.getCampaignInfo(campaign.millis_campaign_id);
      } catch (infoError) {
        console.warn('Could not fetch campaign info from Millis (using detail only):', infoError.message);
      }
      
      // Use campaign info if available (it has caller field), otherwise use campaign detail
      const campaignData = millisCampaignInfo || millisCampaign;
      
      if (campaignData) {
        millisRecords = campaignData.target_numbers || campaignData.records || millisCampaign?.target_numbers || millisCampaign?.records || [];
        
        // Create a map of Millis records by phone number for easy lookup
        for (const millisRecord of millisRecords) {
          if (millisRecord) {
            const phone = (millisRecord.phone || millisRecord).toString().replace(/\D/g, '');
            millisRecordsMap.set(phone, millisRecord);
          }
        }
      }
    } catch (campaignError) {
      console.warn('❌ Could not fetch campaign details from Millis:', campaignError.message);
      // Continue with call logs data only - recordings will still be updated if found
      // Don't throw - continue with call logs data which is more important
    }
    
    // If we have no data at all, return early
    if (recordingsMap.size === 0 && millisRecords.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No records found in call logs or Millis campaign',
        localCount: campaign.target_numbers.length,
        millisCount: 0,
        statusUpdates: 0
      });
    }


    let newRecordsAdded = 0;
    let statusUpdates = 0;
    let recordingUpdates = 0;
    let callerPhoneSynced = false;

    // Update existing records and add new ones
    for (let i = 0; i < campaign.target_numbers.length; i++) {
      const localRecord = campaign.target_numbers[i];
      // Skip if record or phone is null/undefined
      if (!localRecord || !localRecord.phone) {
        console.warn(`⚠️ Skipping record ${i}: missing phone number`);
        continue;
      }
      // Normalize phone number - remove all non-digits
      const normalizedPhone = localRecord.phone.toString().replace(/\D/g, '');
      
      // Check for recording in call logs first (call logs have the most accurate recording info)
      // Try exact match first
      if (!recordingsMap.has(normalizedPhone)) {
        // Try with + prefix
        const withPlus = '+' + normalizedPhone;
        const normalizedWithPlus = withPlus.replace(/\D/g, '');
        if (recordingsMap.has(normalizedWithPlus)) {
          // Update the map for this iteration
          recordingsMap.set(normalizedPhone, recordingsMap.get(normalizedWithPlus));
        }
      }
      
      let hasRecording = false;
      if (recordingsMap.has(normalizedPhone)) {
        const recordingData = recordingsMap.get(normalizedPhone);
        hasRecording = true;
        
        // Always update call recording URL with the most recent session ID
        if (recordingData.recording_url) {
          // Extract session ID from URL (format: /api/v1/calls/{sessionId}/recording)
          const extractSessionId = (url) => {
            if (!url) return null;
            const parts = url.split('/');
            const callsIndex = parts.findIndex(p => p === 'calls');
            if (callsIndex !== -1 && parts[callsIndex + 1]) {
              return parts[callsIndex + 1];
            }
            return null;
          };
          
          // FORCE UPDATE: Always set the recording URL from call logs (most accurate source)
          const oldUrl = localRecord.call_recording_url;
          const newUrl = recordingData.recording_url;
          
          campaign.target_numbers[i].call_recording_url = newUrl;
          
          if (oldUrl !== newUrl || !oldUrl) {
            recordingUpdates++;
          }
        }
        
        // Update call status from call logs
        if (recordingData.call_status && recordingData.call_status !== localRecord.call_status) {
          campaign.target_numbers[i].call_status = recordingData.call_status;
          statusUpdates++;
        }
        
        // Update call duration
        if (recordingData.duration && recordingData.duration !== localRecord.call_duration) {
          campaign.target_numbers[i].call_duration = recordingData.duration;
        }
        
        // Update timestamps
        if (recordingData.started_at) {
          campaign.target_numbers[i].call_started_at = recordingData.started_at;
        }
        if (recordingData.ended_at) {
          campaign.target_numbers[i].call_ended_at = recordingData.ended_at;
        }
      }
      
        // Also check if this record exists in Millis campaign data (for fallback if available)
        if (millisCampaign && millisRecordsMap.has(normalizedPhone)) {
        const millisRecord = millisRecordsMap.get(normalizedPhone);
        
        // Update call status if available (only if not already updated from call logs)
        if (millisRecord.call_status && millisRecord.call_status !== localRecord.call_status) {
          campaign.target_numbers[i].call_status = millisRecord.call_status;
          statusUpdates++;
        }
        
        // Update call recording URL if available from campaign data (fallback)
        if (!hasRecording) {
          const recordingUrl = millisRecord.recording_url || millisRecord.recording || millisRecord.call_recording_url;
          if (recordingUrl && recordingUrl !== localRecord.call_recording_url) {
            campaign.target_numbers[i].call_recording_url = recordingUrl;
          }
        }
        
        // Update call duration if available (fallback)
        if (!hasRecording) {
          const duration = millisRecord.duration || millisRecord.duration_seconds || millisRecord.call_duration;
          if (duration && duration !== localRecord.call_duration) {
            campaign.target_numbers[i].call_duration = duration;
          }
        }
        
        // Update call timestamps if available (fallback)
        if (!hasRecording) {
          if (millisRecord.started_at || millisRecord.call_started_at) {
            campaign.target_numbers[i].call_started_at = new Date(millisRecord.started_at || millisRecord.call_started_at);
          }
          if (millisRecord.ended_at || millisRecord.call_ended_at) {
            campaign.target_numbers[i].call_ended_at = new Date(millisRecord.ended_at || millisRecord.call_ended_at);
          }
        }
        
        // Update metadata if available
        if (millisRecordsMap.has(normalizedPhone)) {
          const millisRecord = millisRecordsMap.get(normalizedPhone);
          if (millisRecord.metadata) {
            campaign.target_numbers[i].metadata = {
              ...campaign.target_numbers[i].metadata,
              ...millisRecord.metadata
            };
          }
        }
        
        // Remove from map so we know it's been processed
        millisRecordsMap.delete(normalizedPhone);
      }
    }

    // Add any remaining Millis records that don't exist locally
    for (const [phone, millisRecord] of millisRecordsMap) {
      // Skip if this is a caller phone
      if (millisRecord.metadata?.is_caller) {
        continue;
      }
      
      campaign.target_numbers.push({
        phone: millisRecord.phone || phone,
        name: millisRecord.name || '',
        call_status: millisRecord.call_status || 'pending',
        metadata: millisRecord.metadata || {}
      });
      newRecordsAdded++;
    }

    // Update campaign status from Millis (only if we fetched it)
    // Use campaignInfo if available, otherwise use millisCampaign
    try {
      const campaignDataForStatus = millisCampaignInfo || millisCampaign;
      if (campaignDataForStatus && campaignDataForStatus.status) {
        const statusMap = {
          'idle': 'draft',
          'draft': 'draft',
          'started': 'active', // Millis uses 'started' for active campaigns
          'active': 'active',
          'running': 'running',
          'paused': 'paused',
          'finished': 'completed',
          'failed': 'failed',
          'completed': 'completed'
        };
        const mappedStatus = statusMap[campaignDataForStatus.status] || campaign.status;
        if (mappedStatus !== campaign.status) {
          console.log(`📊 Syncing campaign status from Millis: ${mappedStatus} (was: ${campaign.status})`);
          campaign.status = mappedStatus;
        }
      }
    } catch (statusError) {
      console.warn('❌ Could not update campaign status from Millis:', statusError.message);
      // Continue without updating status
    }

    // Sync caller phone from Millis (if set on Millis dashboard)
    // Use campaignInfo first (has caller field), then fallback to millisCampaign
    try {
      const campaignDataForCaller = millisCampaignInfo || millisCampaign;
      
      if (campaignDataForCaller) {
        // Check multiple possible field names for caller phone in Millis response
        // CampaignInfo endpoint has 'caller' field, so check that first
        const millisCallerPhone = campaignDataForCaller.caller || 
                                  campaignDataForCaller.caller_phone || 
                                  campaignDataForCaller.phone_number || 
                                  campaignDataForCaller.caller_number ||
                                  campaignDataForCaller.assigned_phone_number ||
                                  (campaignDataForCaller.phone && typeof campaignDataForCaller.phone === 'string' ? campaignDataForCaller.phone : null);
        
        // Log Millis campaign structure for debugging
        console.log(`📞 Millis campaign data structure:`, {
          source: millisCampaignInfo ? 'info endpoint' : 'detail endpoint',
          hasCaller: !!campaignDataForCaller.caller,
          hasCallerPhone: !!campaignDataForCaller.caller_phone,
          hasPhoneNumber: !!campaignDataForCaller.phone_number,
          callerValue: campaignDataForCaller.caller,
          callerPhoneValue: campaignDataForCaller.caller_phone,
          phoneNumberValue: campaignDataForCaller.phone_number,
          extracted: millisCallerPhone,
          fullCampaign: JSON.stringify(campaignDataForCaller, null, 2).substring(0, 500) // First 500 chars for debugging
        });
        
        if (millisCallerPhone) {
          // Normalize phone numbers for comparison (remove spaces, dashes, etc.)
          const normalizePhone = (phone) => {
            if (!phone) return '';
            return phone.toString().replace(/\s+/g, '').replace(/-/g, '').trim();
          };
          
          const normalizedMillisPhone = normalizePhone(millisCallerPhone);
          const normalizedLocalPhone = normalizePhone(campaign.assigned_phone_number);
          
          if (normalizedMillisPhone && normalizedMillisPhone !== normalizedLocalPhone) {
            console.log(`📞 Syncing caller phone from Millis: ${millisCallerPhone} (was: ${campaign.assigned_phone_number || 'not set'})`);
            campaign.assigned_phone_number = millisCallerPhone;
            callerPhoneSynced = true; // Mark that caller phone was synced
            
            // Save campaign immediately with caller phone update
            try {
              await campaign.save();
              console.log(`✓ Campaign saved with caller phone from Millis: ${millisCallerPhone}`);
            } catch (saveError) {
              console.error('Failed to save campaign with caller phone:', saveError.message);
            }
            
            // Also update CallerPhone record if it exists
            try {
              const existingCallerPhone = await CallerPhone.findOne({
                campaign_id: campaign._id,
                is_active: true
              });
              
              if (existingCallerPhone) {
                // Update existing record
                existingCallerPhone.caller_number = millisCallerPhone;
                existingCallerPhone.caller_status = 'live';
                await existingCallerPhone.save();
                console.log(`✓ Updated CallerPhone record with phone from Millis`);
              } else {
                // Create new CallerPhone record if campaign has a user_id
                if (campaign.user_id) {
                  const newCallerPhone = new CallerPhone({
                    user_id: campaign.user_id,
                    campaign_id: campaign._id,
                    caller_number: millisCallerPhone,
                    caller_status: 'live',
                    is_active: true,
                    objectid: `millis_${Date.now()}`, // Required field
                    metadata: {
                      synced_from_millis: true,
                      synced_at: new Date()
                    }
                  });
                  await newCallerPhone.save();
                  console.log(`✓ Created new CallerPhone record with phone from Millis`);
                }
              }
            } catch (callerPhoneError) {
              console.warn('Could not update/create CallerPhone record:', callerPhoneError.message);
              // Continue - main campaign update is already saved
            }
          } else if (normalizedMillisPhone === normalizedLocalPhone) {
            console.log(`✓ Caller phone already synced: ${millisCallerPhone}`);
          } else {
            console.log(`⚠️ Millis caller phone is empty or invalid`);
          }
        } else {
          console.log(`⚠️ No caller phone found in Millis campaign response. Checking all fields...`);
          // Log all top-level keys for debugging
          console.log(`Millis campaign keys:`, Object.keys(campaignDataForCaller || {}));
          console.log(`Millis campaignInfo keys:`, Object.keys(millisCampaignInfo || {}));
          console.log(`Millis campaignDetail keys:`, Object.keys(millisCampaign || {}));
        }
      } else {
        console.warn('⚠️ millisCampaign and millisCampaignInfo are both null/undefined - cannot sync caller phone');
      }
    } catch (callerSyncError) {
      console.error('❌ Could not sync caller phone from Millis:', callerSyncError.message);
      console.error('Caller sync error stack:', callerSyncError.stack);
      // Continue without updating caller phone
    }

    // Update stats
    try {
      if (!campaign.stats) {
        campaign.stats = {};
      }
      campaign.stats.total_numbers = (campaign.target_numbers || []).filter(r => !r?.metadata?.is_caller).length;
      const completedCalls = (campaign.target_numbers || []).filter(r => 
        !r?.metadata?.is_caller && 
        r?.call_status && 
        r.call_status !== 'pending' && 
        r.call_status !== 'idle'
      ).length;
      campaign.stats.calls_made = completedCalls;
      campaign.stats.calls_remaining = campaign.stats.total_numbers - completedCalls;

      // Mark the target_numbers array as modified
      campaign.markModified('target_numbers');
      await campaign.save();
    } catch (saveError) {
      console.error('❌ Failed to save campaign updates:', saveError.message);
      // Continue - we still want to return the response even if save fails
    }

    // Build success message
    let message = 'Records and statuses synced successfully';
    if (recordingUpdates > 0) {
      message = `Updated ${recordingUpdates} recording URL(s) and ${statusUpdates} status(es)`;
    } else if (statusUpdates > 0) {
      message = `Updated ${statusUpdates} call status(es)`;
    } else if (newRecordsAdded > 0) {
      message = `Added ${newRecordsAdded} new record(s)`;
    } else {
      message = 'Status is already up to date';
    }

    res.status(200).json({
      success: true,
      message,
      newRecordsAdded,
      statusUpdates,
      recordingUpdates,
      callerPhoneSynced, // Indicate if caller phone was synced from Millis
      localCount: campaign.target_numbers.length,
      millisCount: millisRecords.length,
      campaignStatus: campaign.status,
      assigned_phone_number: campaign.assigned_phone_number // Include synced caller phone in response
    });

  } catch (millisError) {
    console.error('❌ Failed to sync records from Millis:', millisError.message);
    console.error('Error stack:', millisError.stack);
    console.error('Full error:', millisError);
    
    // Return error with better error handling
    const errorMessage = millisError.message || 'Unknown error occurred';
    const errorDetails = millisError.response?.data || millisError.details || errorMessage;
    
    // If it's a Millis API error, provide more helpful message
    if (millisError.response) {
      console.error('Millis API Response:', {
        status: millisError.response.status,
        data: millisError.response.data
      });
    }
    
    // Return error but don't block user - return partial success if we have any data
    return res.status(500).json({ 
      error: 'Failed to sync records from Millis',
      details: errorDetails,
      message: 'Sync partially completed. Some data may not be up to date.',
      stack: process.env.NODE_ENV === 'development' ? millisError.stack : undefined
    });
  }
}));

module.exports = router;
