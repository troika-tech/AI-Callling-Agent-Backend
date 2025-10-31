const asyncHandler = require('../../middleware/asyncHandler');
const VoiceAgent = require('../../models/VoiceAgent');
const ExotelPhone = require('../../models/ExotelPhone');
const millis = require('../../clients/millis');

// Create a new voice agent
exports.create = asyncHandler(async (req, res) => {
  const { name, voice_label } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ 
      success: false, 
      error: 'Agent name is required' 
    });
  }

  const agent = new VoiceAgent({
    user_id: req.user.id,
    name: name.trim(),
    voice_label: voice_label || "You're a helpful assistant.",
    status: 'active',
  });

  // Try to sync with Millis
  try {
    console.log('Syncing voice agent to Millis dashboard...');
    const millisAgentData = {
      name: agent.name,
      config: {
        prompt: agent.voice_label,
        voice: {
          provider: "openai",
          voice_id: "alloy"
        }
      }
    };

    console.log('Creating agent in Millis with data:', JSON.stringify(millisAgentData));
    const millisResponse = await millis.createAgent(millisAgentData);
    
    if (millisResponse && millisResponse.id) {
      agent.millis_agent_id = millisResponse.id;
      console.log(`✅ Voice agent synced to Millis with ID: ${millisResponse.id}`);
    } else {
      console.log('⚠️ Millis response:', millisResponse);
    }
  } catch (millisError) {
    console.error('❌ Failed to sync voice agent to Millis:', millisError.message);
    console.error('❌ Millis error details:', millisError?.response?.data || millisError);
    console.warn('⚠️ Agent will be saved locally only - this is OK, you can sync later using "Sync to Millis" button');
    // Don't fail agent creation if Millis sync fails
  }

  await agent.save();
  
  // Reload agent to ensure millis_agent_id is available
  const reloadedAgent = await VoiceAgent.findById(agent._id);
  if (!reloadedAgent) {
    console.error('Failed to reload agent after creation');
  } else {
    agent.millis_agent_id = reloadedAgent.millis_agent_id;
    console.log(`Agent ${agent.name} created with millis_agent_id: ${agent.millis_agent_id}`);
  }

  // Note: Agent-to-phone linking is now manual via the "Link to Agent" button
  // This gives users full control over which agent is linked to which phone
  console.log(`✅ Voice agent created. Use "Link to Agent" button in Phone Numbers tab to assign it to phones.`);

  res.status(201).json({
    success: true,
    data: agent,
    message: 'Voice agent created successfully',
  });
});

// Get all voice agents with pagination
exports.list = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 25;
  const search = req.query.search || '';

  // Build search query - filter by user_id
  const query = { user_id: req.user.id };
  
  if (search) {
    query.name = { $regex: search, $options: 'i' };
  }

  // Get total count
  const total = await VoiceAgent.countDocuments(query);

  // Calculate pagination
  const skip = (page - 1) * limit;
  const totalPages = Math.ceil(total / limit);

  // Fetch agents
  const agents = await VoiceAgent.find(query)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({
    success: true,
    data: {
      items: agents,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
      },
    },
    items: agents,
    totalPages,
  });
});

// Get a single voice agent
exports.getById = asyncHandler(async (req, res) => {
  const agent = await VoiceAgent.findOne({ _id: req.params.id, user_id: req.user.id });

  if (!agent) {
    return res.status(404).json({
      success: false,
      error: 'Voice agent not found',
    });
  }

  res.status(200).json({
    success: true,
    data: agent,
  });
});

// Sync all phone-agent assignments to Millis
exports.syncToMillis = asyncHandler(async (req, res) => {
  try {
    console.log('🔄 Starting sync of phone-agent assignments to Millis...');
    
    // Get all phones with assigned agents
    const phones = await ExotelPhone.find({
      user_id: req.user.id,
      assigned_agent_id: { $ne: null }
    }).populate('assigned_agent_id');
    
    console.log(`Found ${phones.length} phones with assigned agents`);
    
    // Log details for debugging
    phones.forEach(phone => {
      console.log(`  - Phone: ${phone.phone_number}, Status: ${phone.status}, Agent ID: ${phone.assigned_agent_id}, Millis Agent ID: ${phone.millis_agent_id}`);
    });
    
    const results = {
      total: phones.length,
      successful: 0,
      failed: 0,
      errors: []
    };
    
    for (const phone of phones) {
      try {
        if (!phone.millis_agent_id) {
          console.log(`Skipping phone ${phone.phone_number} - no millis_agent_id`);
          continue;
        }
        
        console.log(`Syncing phone ${phone.phone_number} to agent ${phone.millis_agent_id}`);
        
        const millisPayload = {
          agentId: phone.millis_agent_id
        };
        
        await millis.setPhoneAgent(phone.phone_number, millisPayload);
        
        phone.integration_status = 'success';
        phone.integration_error = null;
        await phone.save();
        
        results.successful++;
        console.log(`✅ Successfully synced phone ${phone.phone_number}`);
      } catch (error) {
        results.failed++;
        results.errors.push({
          phone: phone.phone_number,
          error: error.message
        });
        
        phone.integration_status = 'failed';
        phone.integration_error = error.message;
        await phone.save();
        
        console.error(`❌ Failed to sync phone ${phone.phone_number}:`, error.message);
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Sync completed',
      results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update a voice agent
exports.update = asyncHandler(async (req, res) => {
  const { name, voice_label, status } = req.body;

  const agent = await VoiceAgent.findOne({ _id: req.params.id, user_id: req.user.id });

  if (!agent) {
    return res.status(404).json({
      success: false,
      error: 'Voice agent not found',
    });
  }

  if (name) agent.name = name.trim();
  if (voice_label !== undefined) agent.voice_label = voice_label;
  if (status) agent.status = status;

  await agent.save();

  res.status(200).json({
    success: true,
    data: agent,
    message: 'Voice agent updated successfully',
  });
});

// Delete a voice agent
exports.delete = asyncHandler(async (req, res) => {
  const agent = await VoiceAgent.findOne({ _id: req.params.id, user_id: req.user.id });

  if (!agent) {
    return res.status(404).json({
      success: false,
      error: 'Voice agent not found',
    });
  }

  await agent.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Voice agent deleted successfully',
  });
});

// Sync voice agents from Millis
exports.syncFromMillis = asyncHandler(async (req, res) => {
  try {
    console.log('Starting voice agent sync from Millis...');
    
    // Fetch all agents from Millis
    let millisAgents;
    try {
      millisAgents = await millis.listAgents({ page: 1, pageSize: 100 });
      console.log('Millis API response:', JSON.stringify(millisAgents, null, 2));
    } catch (millisError) {
      console.error('Failed to fetch agents from Millis:', millisError.message);
      console.error('Millis error details:', millisError);
      return res.status(500).json({
        error: 'Failed to connect to Millis API',
        details: millisError.message
      });
    }
    
    // Handle different response formats
    let agentsList = [];
    if (Array.isArray(millisAgents)) {
      agentsList = millisAgents;
      console.log(`Received direct array: ${agentsList.length} agents`);
    } else if (millisAgents.items && Array.isArray(millisAgents.items)) {
      agentsList = millisAgents.items;
      console.log(`Received items array: ${agentsList.length} agents`);
    } else if (millisAgents.agents && Array.isArray(millisAgents.agents)) {
      agentsList = millisAgents.agents;
      console.log(`Received agents array: ${agentsList.length} agents`);
    } else if (millisAgents.data && Array.isArray(millisAgents.data)) {
      agentsList = millisAgents.data;
      console.log(`Received data array: ${agentsList.length} agents`);
    } else {
      console.log('Unexpected Millis API response format:', millisAgents);
      return res.status(200).json({
        success: true,
        message: 'No agents found in Millis (unexpected response format)',
        agentsAdded: 0,
        debug: millisAgents
      });
    }
    
    if (agentsList.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No agents found in Millis',
        agentsAdded: 0
      });
    }

    console.log(`Found ${agentsList.length} agents on Millis`);

    // Get all local agent IDs
    const localAgents = await VoiceAgent.find({ user_id: req.user.id });
    const localMillisIds = new Set(localAgents
      .map(a => a.millis_agent_id)
      .filter(id => id));

    let agentsAdded = 0;

    // Process each Millis agent
    for (const millisAgent of agentsList) {
      const millisId = millisAgent.id || millisAgent._id || millisAgent.agent_id;
      
      // Skip if agent already exists locally
      if (localMillisIds.has(millisId)) {
        console.log(`Skipping agent ${millisAgent.name} (already exists locally)`);
        continue;
      }

      // Create local agent from Millis data
      const localAgent = new VoiceAgent({
        user_id: req.user.id,
        name: millisAgent.name || `Agent ${millisId}`,
        voice_label: millisAgent.config?.prompt || millisAgent.prompt || "You're a helpful assistant.",
        status: 'active',
        millis_agent_id: millisId,
        created_at: millisAgent.created_at ? new Date(millisAgent.created_at) : new Date(),
        updated_at: millisAgent.updated_at ? new Date(millisAgent.updated_at) : new Date()
      });

      await localAgent.save();
      agentsAdded++;
      console.log(`✓ Added agent from Millis: ${millisAgent.name}`);
    }

    console.log(`Agent sync completed. Added ${agentsAdded} new agents.`);

    res.status(200).json({
      success: true,
      message: 'Voice agents synced successfully from Millis',
      agentsAdded,
      totalMillisAgents: agentsList.length,
      totalLocalAgents: localAgents.length
    });

  } catch (millisError) {
    console.error('❌ Failed to sync voice agents from Millis');
    console.error('Error message:', millisError.message);
    console.error('Error type:', millisError.name);
    
    if (millisError.response) {
      console.error('Response status:', millisError.response.status);
      console.error('Response data:', millisError.response.data);
    } else if (millisError.request) {
      console.error('No response received');
    }
    
    return res.status(500).json({ 
      error: 'Failed to sync voice agents from Millis',
      details: millisError.message
    });
  }
});
