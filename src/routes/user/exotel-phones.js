const express = require('express');
const ExotelPhone = require('../../models/ExotelPhone');
const { requireAuth } = require('../../middleware/auth');
const asyncHandler = require('../../middleware/asyncHandler');
const millisClient = require('../../clients/millis');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// GET /api/v1/user/exotel-phones - Get user's Exotel phones
// POST /api/v1/user/exotel-phones/:phoneId/link-agent - Link agent to a phone
router.post('/:phoneId/link-agent', asyncHandler(async (req, res) => {
  const { phoneId } = req.params;
  const { agentId } = req.body;
  const millis = require('../../clients/millis');
  
  console.log(`Linking agent ${agentId} to phone ${phoneId}...`);
  
  // Find the phone
  const phone = await ExotelPhone.findOne({
    _id: phoneId,
    user_id: req.user.id
  });
  
  if (!phone) {
    return res.status(404).json({
      success: false,
      error: 'Phone not found'
    });
  }
  
  // Update the phone with the new agent
  phone.assigned_agent_id = agentId;
  
  // Get the agent to get millis_agent_id
  const VoiceAgent = require('../../models/VoiceAgent');
  const agent = await VoiceAgent.findById(agentId);
  
  if (agent && agent.millis_agent_id) {
    phone.millis_agent_id = agent.millis_agent_id;
    
    // Link on Millis
    try {
      console.log(`Linking phone ${phone.phone_number} to agent ${agent.millis_agent_id} on Millis...`);
      
      const millisPayload = {
        agentId: agent.millis_agent_id
      };
      
      await millis.setPhoneAgent(phone.phone_number, millisPayload);
      
      phone.integration_status = 'success';
      phone.integration_error = null;
      
      console.log(`✅ Successfully linked agent to phone on Millis`);
    } catch (millisError) {
      console.error('❌ Failed to link agent to phone on Millis:', millisError.message);
      phone.integration_status = 'failed';
      phone.integration_error = millisError.message;
    }
  }
  
  await phone.save();
  
  res.json({
    success: true,
    message: 'Agent linked successfully',
    phone: {
      _id: phone._id,
      phone_number: phone.phone_number,
      assigned_agent_id: phone.assigned_agent_id,
      millis_agent_id: phone.millis_agent_id,
      integration_status: phone.integration_status
    }
  });
}));

router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 25, search = '', status = '' } = req.query;
  
  const query = { user_id: req.user.id };
  
  if (status) {
    query.status = status;
  }
  
  if (search) {
    query.$or = [
      { phone_number: { $regex: search, $options: 'i' } },
      { provider: { $regex: search, $options: 'i' } },
      { tags: { $in: [new RegExp(search, 'i')] } }
    ];
  }
  
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const phones = await ExotelPhone.find(query)
    .select('-api_key -api_token -account_sid') // Exclude sensitive data
    .populate('assigned_agent_id', 'name voice_label status millis_agent_id')
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(parseInt(limit));
  
  const total = await ExotelPhone.countDocuments(query);
  
  res.json({
    success: true,
    items: phones,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
}));

// POST /api/v1/user/exotel-phones - Create new Exotel phone
router.post('/', asyncHandler(async (req, res) => {
  const {
    provider = 'exotel',
    phone_number,
    api_key,
    api_token,
    account_sid,
    subdomain,
    app_id,
    region = 'us-west',
    country = 'United States (+1)',
    tags = []
  } = req.body;
  
  if (!phone_number) {
    return res.status(400).json({ 
      error: 'Phone number is required' 
    });
  }
  
  // Validate phone number format - must start with +
  if (!phone_number.startsWith('+')) {
    return res.status(400).json({ 
      error: 'Phone number must include country code and start with + (e.g., +919876543210 or +14155550100)' 
    });
  }
  
  // Validate phone number length (minimum 8 digits after country code)
  const phoneDigits = phone_number.replace(/[^0-9]/g, '');
  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    return res.status(400).json({ 
      error: 'Phone number must be between 10 and 15 digits (e.g., +919876543210 or +14155550100)' 
    });
  }
  
  // Check if phone number already exists for this user
  const existingPhone = await ExotelPhone.findOne({
    user_id: req.user.id,
    phone_number
  });
  
  let exotelPhone;
  
  if (existingPhone) {
    // Update existing phone instead of creating a new one
    console.log(`Phone ${phone_number} already exists - updating with new credentials`);
    exotelPhone = existingPhone;
    
    // Update fields
    exotelPhone.provider = provider || exotelPhone.provider;
    exotelPhone.api_key = api_key || exotelPhone.api_key;
    exotelPhone.api_token = api_token || exotelPhone.api_token;
    if (account_sid !== undefined) exotelPhone.account_sid = account_sid;
    if (subdomain !== undefined) exotelPhone.subdomain = subdomain;
    if (app_id !== undefined) exotelPhone.app_id = app_id;
    if (region) exotelPhone.region = region;
    if (country) exotelPhone.country = country;
    if (Array.isArray(tags)) exotelPhone.tags = tags;
    // Keep existing status unless explicitly changed
    exotelPhone.updated_at = new Date();
    
    await exotelPhone.save();
  } else {
    // Create new phone
    exotelPhone = new ExotelPhone({
      user_id: req.user.id,
      provider,
      phone_number,
      api_key: api_key || '',
      api_token: api_token || '',
      account_sid,
      subdomain,
      app_id,
      region,
      country,
      tags: Array.isArray(tags) ? tags : [],
      status: 'live' // Set status to 'live' for Exotel-bought numbers
    });
    
    await exotelPhone.save();
  }
  
  console.log(`Phone ${phone_number} saved locally with status: live`);
  
  // Automatically import to Millis via admin import endpoint
  try {
    console.log(`Auto-importing phone ${phone_number} to Millis...`);
    
    const millisPayload = {
      phone: phone_number,
      country: country || 'IN',
      region: region || 'IN',
      provider: provider || 'exotel',
      api_key: api_key || '',
      api_token: api_token || '',
      sid: account_sid || '',
      subdomain: subdomain || ''
    };
    
    const millisResponse = await millisClient.axios.post('/phones/import', millisPayload);
    
    if (millisResponse.data) {
      exotelPhone.millis_phone_id = millisResponse.data.id || millisResponse.data.phone_id;
      exotelPhone.integration_status = 'success';
      exotelPhone.status = 'live';
      exotelPhone.integration_error = null;
      await exotelPhone.save();
      
      console.log(`Phone ${phone_number} successfully imported to Millis with ID: ${exotelPhone.millis_phone_id}`);
    }
  } catch (millisError) {
    console.error(`Failed to auto-import phone ${phone_number} to Millis:`, millisError.message);
    
    // Keep status as 'live' even if Millis import fails
    // User can manually re-import if needed
    exotelPhone.integration_status = 'failed';
    exotelPhone.integration_error = millisError.message;
    exotelPhone.status = 'live'; // Still keep as live
    await exotelPhone.save();
    
    console.log(`Phone ${phone_number} kept as live despite Millis import failure`);
  }
  
  // Return phone without sensitive data
  const phoneResponse = exotelPhone.toObject();
  delete phoneResponse.api_key;
  delete phoneResponse.api_token;
  delete phoneResponse.account_sid;
  
  res.status(existingPhone ? 200 : 201).json({
    success: true,
    message: existingPhone ? 'Phone updated successfully' : 'Phone created successfully',
    phone: phoneResponse
  });
}));

// GET /api/v1/user/exotel-phones/:id - Get specific Exotel phone
router.get('/:id', asyncHandler(async (req, res) => {
  const phone = await ExotelPhone.findOne({
    _id: req.params.id,
    user_id: req.user.id
  }).select('-api_key -api_token -account_sid');
  
  if (!phone) {
    return res.status(404).json({ error: 'Phone not found' });
  }
  
  res.json({
    success: true,
    phone
  });
}));

// PATCH /api/v1/user/exotel-phones/:id - Update Exotel phone
router.patch('/:id', asyncHandler(async (req, res) => {
  const {
    phone_number,
    api_key,
    api_token,
    account_sid,
    subdomain,
    app_id,
    region,
    country,
    tags,
    status
  } = req.body;
  
  const phone = await ExotelPhone.findOne({
    _id: req.params.id,
    user_id: req.user.id
  });
  
  if (!phone) {
    return res.status(404).json({ error: 'Phone not found' });
  }
  
  // Update fields
  if (phone_number) phone.phone_number = phone_number;
  if (api_key) phone.api_key = api_key;
  if (api_token) phone.api_token = api_token;
  if (account_sid !== undefined) phone.account_sid = account_sid;
  if (subdomain !== undefined) phone.subdomain = subdomain;
  if (app_id !== undefined) phone.app_id = app_id;
  if (region) phone.region = region;
  if (country) phone.country = country;
  if (Array.isArray(tags)) phone.tags = tags;
  if (status) phone.status = status;
  
  await phone.save();
  
  // Return phone without sensitive data
  const phoneResponse = phone.toObject();
  delete phoneResponse.api_key;
  delete phoneResponse.api_token;
  delete phoneResponse.account_sid;
  
  res.json({
    success: true,
    phone: phoneResponse
  });
}));

// DELETE /api/v1/user/exotel-phones/:id - Delete Exotel phone
router.delete('/:id', asyncHandler(async (req, res) => {
  const phone = await ExotelPhone.findOne({
    _id: req.params.id,
    user_id: req.user.id
  });
  
  if (!phone) {
    return res.status(404).json({ error: 'Phone not found' });
  }
  
  await ExotelPhone.findByIdAndDelete(req.params.id);
  
  res.json({
    success: true,
    message: 'Phone deleted successfully'
  });
}));

// POST /api/v1/user/exotel-phones/:id/import - Re-import phone to Millis
router.post('/:id/import', asyncHandler(async (req, res) => {
  const phone = await ExotelPhone.findOne({
    _id: req.params.id,
    user_id: req.user.id
  });
  
  if (!phone) {
    return res.status(404).json({ error: 'Phone not found' });
  }
  
  try {
    console.log(`Re-importing phone ${phone.phone_number} to Millis...`);
    
    const millisPayload = {
      provider: phone.provider,
      phone_number: phone.phone_number,
      api_key: phone.api_key,
      api_token: phone.api_token,
      account_sid: phone.account_sid,
      subdomain: phone.subdomain,
      app_id: phone.app_id,
      region: phone.region,
      country: phone.country
    };
    
    const millisResponse = await millisClient.axios.post('/phones/import', millisPayload);
    
    if (millisResponse.data) {
      phone.millis_phone_id = millisResponse.data.id || millisResponse.data.phone_id;
      phone.integration_status = 'success';
      phone.status = 'active';
      phone.integration_error = null;
      await phone.save();
      
      console.log(`Phone ${phone.phone_number} successfully re-imported to Millis`);
      
      res.json({
        success: true,
        message: 'Phone imported successfully',
        millis_phone_id: phone.millis_phone_id
      });
    } else {
      throw new Error('Invalid response from Millis API');
    }
    
  } catch (millisError) {
    console.error(`Failed to re-import phone ${phone.phone_number} to Millis:`, millisError.message);
    
    phone.integration_status = 'failed';
    phone.integration_error = millisError.message;
    phone.status = 'error';
    await phone.save();
    
    res.status(500).json({
      success: false,
      error: `Failed to import phone: ${millisError.message}`
    });
  }
}));

module.exports = router;
