const CallerPhone = require('../models/CallerPhone');
const Campaign = require('../models/Campaign');
const AgentDocuments = require('../models/AgentDocuments');
const asyncHandler = require('../middleware/asyncHandler');
const millis = require('../clients/millis');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/agentdocuments';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 8 * 1024 * 1024 // 8MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.json', '.txt', '.pdf'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, JSON, TXT, and PDF files are allowed'), false);
    }
  }
});

// Upload knowledge base document
const uploadKnowledgeBaseDocument = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { campaignId } = req.params;

  console.log('Uploading knowledge base document:', { userId, campaignId });

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded'
    });
  }

  // Handle default-campaign-id case - use a dummy ObjectId instead of creating a campaign
  let actualCampaignId = campaignId;
  let campaign = null;

  if (campaignId === 'default-campaign-id') {
    // Use a dummy ObjectId for documents not associated with any specific campaign
    // This prevents creating unwanted campaigns in the campaign list
    const { ObjectId } = require('mongoose').Types;
    actualCampaignId = new ObjectId('000000000000000000000000'); // Dummy ID
    console.log('Using dummy campaign ID for document storage:', actualCampaignId);
  } else {
    // Check if campaign exists and belongs to user
    campaign = await Campaign.findOne({ _id: campaignId, user_id: userId });
    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found or access denied'
      });
    }
    actualCampaignId = campaignId;
  }

  try {
    // Create document record in AgentDocuments table
    const documentData = {
      user_id: userId,
      campaign_id: actualCampaignId,
      filename: req.file.filename,
      original_name: req.file.originalname,
      file_type: path.extname(req.file.originalname).toLowerCase().substring(1),
      file_size: req.file.size,
      file_path: req.file.path,
      upload_date: new Date(),
      processed: false,
      status: 'uploaded',
      metadata: {
        uploaded_via: 'knowledge_base_upload',
        original_campaign_id: campaignId
      }
    };

    const agentDocument = new AgentDocuments(documentData);
    await agentDocument.save();

    console.log('Document saved to AgentDocuments table:', agentDocument._id);

    // Update CallerPhone knowledge base only if this is a real campaign (not dummy campaign ID)
    if (campaign && actualCampaignId.toString() !== '000000000000000000000000') {
      // Also update the existing CallerPhone knowledge base for backward compatibility
      let callerPhone = await CallerPhone.findOne({
        campaign_id: actualCampaignId,
        is_active: true
      });

      if (!callerPhone) {
        // Create a new caller phone record for knowledge base storage
        callerPhone = new CallerPhone({
          user_id: userId,
          campaign_id: actualCampaignId,
          caller_number: 'knowledge_base_' + actualCampaignId,
          caller_status: 'active',
          objectid: 'kb_' + Date.now(),
          metadata: {
            name: 'Knowledge Base Storage',
            provider: 'knowledge_base'
          },
          knowledge_base: {
            documents: [],
            total_documents: 0
          }
        });
      }

      // Add document to knowledge base for backward compatibility
      const kbDocumentData = {
        filename: req.file.filename,
        original_name: req.file.originalname,
        file_type: path.extname(req.file.originalname).toLowerCase().substring(1),
        file_size: req.file.size,
        file_path: req.file.path,
        upload_date: new Date(),
        processed: false,
        agent_document_id: agentDocument._id // Reference to the new table
      };

      callerPhone.knowledge_base.documents.push(kbDocumentData);
      callerPhone.knowledge_base.total_documents = callerPhone.knowledge_base.documents.length;
      await callerPhone.save();
    }

    console.log('Knowledge base document uploaded successfully:', documentData);

    // Try to sync document to Millis knowledge base
    try {
      console.log('Syncing document to Millis knowledge base...');
      
      // Millis API expects: object_key, description, name, file_type, size
      // Since we're storing locally, we'll use a path-based object_key
      const objectKey = `agentdocuments/${agentDocument._id.toString()}/${req.file.filename}`;
      
      const millisDocumentData = {
        object_key: objectKey,
        name: req.file.originalname,
        description: `Agent document: ${req.file.originalname}`,
        file_type: path.extname(req.file.originalname).toLowerCase().substring(1),
        size: req.file.size
      };

      console.log('Creating document in Millis with data:', JSON.stringify(millisDocumentData));
      const millisResponse = await millis.createKnowledgeFile(millisDocumentData);
      
      if (millisResponse && millisResponse.id) {
        agentDocument.millis_document_id = millisResponse.id;
        await agentDocument.save();
        console.log(`Document synced to Millis knowledge base with ID: ${millisResponse.id}`);
      } else {
        console.log('Millis response:', millisResponse);
      }
    } catch (millisError) {
      console.error('Failed to sync document to Millis:', millisError.message);
      console.error('Millis error details:', millisError);
      console.warn('Document will be saved locally only');
    }

    return res.status(200).json({
      success: true,
      message: 'Document uploaded successfully',
      document: {
        id: agentDocument._id,
        filename: agentDocument.filename,
        original_name: agentDocument.original_name,
        file_type: agentDocument.file_type,
        file_size: agentDocument.file_size,
        upload_date: agentDocument.upload_date,
        status: agentDocument.status
      },
      campaign: campaign ? {
        id: actualCampaignId,
        name: campaign.name
      } : null
    });

  } catch (err) {
    console.error('Error uploading knowledge base document:', err);
    
    // Clean up uploaded file if database operation failed
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to upload document'
    });
  }
});

// Get knowledge base documents for a campaign
const getKnowledgeBaseDocuments = asyncHandler(async (req, res) => {
  const { campaignId } = req.params;
  const userId = req.user.id;

  console.log('Getting knowledge base documents for campaign:', campaignId);

  // Check if campaign exists and belongs to user
  const campaign = await Campaign.findOne({ _id: campaignId, user_id: userId });
  if (!campaign) {
    return res.status(404).json({
      success: false,
      error: 'Campaign not found or access denied'
    });
  }

  // Get caller phone record with knowledge base
  const callerPhone = await CallerPhone.findOne({
    campaign_id: campaignId,
    is_active: true
  });

  if (!callerPhone || !callerPhone.knowledge_base) {
    return res.status(200).json({
      success: true,
      documents: [],
      total_documents: 0
    });
  }

  return res.status(200).json({
    success: true,
    documents: callerPhone.knowledge_base.documents,
    total_documents: callerPhone.knowledge_base.total_documents,
    last_updated: callerPhone.knowledge_base.last_updated
  });
});

// Delete knowledge base document
const deleteKnowledgeBaseDocument = asyncHandler(async (req, res) => {
  const { campaignId, documentId } = req.params;
  const userId = req.user.id;

  console.log('Deleting knowledge base document:', { campaignId, documentId });

  // Check if campaign exists and belongs to user
  const campaign = await Campaign.findOne({ _id: campaignId, user_id: userId });
  if (!campaign) {
    return res.status(404).json({
      success: false,
      error: 'Campaign not found or access denied'
    });
  }

  // Find caller phone record
  const callerPhone = await CallerPhone.findOne({
    campaign_id: campaignId,
    is_active: true
  });

  if (!callerPhone || !callerPhone.knowledge_base) {
    return res.status(404).json({
      success: false,
      error: 'Knowledge base not found'
    });
  }

  // Find and remove document
  const documentIndex = callerPhone.knowledge_base.documents.findIndex(
    doc => doc._id.toString() === documentId
  );

  if (documentIndex === -1) {
    return res.status(404).json({
      success: false,
      error: 'Document not found'
    });
  }

  const document = callerPhone.knowledge_base.documents[documentIndex];
  
  // Delete file from filesystem
  if (fs.existsSync(document.file_path)) {
    fs.unlinkSync(document.file_path);
  }

  // Remove document from array
  callerPhone.knowledge_base.documents.splice(documentIndex, 1);
  await callerPhone.save();

  console.log('Knowledge base document deleted successfully');

  return res.status(200).json({
    success: true,
    message: 'Document deleted successfully'
  });
});

// Set caller phone for a campaign
const setCallerPhone = asyncHandler(async (req, res) => {
  const { campaignId } = req.params;
  const { caller_number, caller_status, objectid, metadata, selected_documents } = req.body;
  const userId = req.user.id;

  console.log('Setting caller phone:', { campaignId, caller_number, caller_status, objectid, selected_documents, userId });

  // Validate required fields
  if (!caller_number || !caller_status || !objectid) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required fields: caller_number, caller_status, objectid' 
    });
  }

  // Check if campaign exists and belongs to user
  const campaign = await Campaign.findOne({ _id: campaignId, user_id: userId });
  if (!campaign) {
    return res.status(404).json({ 
      success: false, 
      error: 'Campaign not found or access denied' 
    });
  }

  // Deactivate any existing active caller phone for this campaign
  await CallerPhone.updateMany(
    { campaign_id: campaignId, is_active: true },
    { is_active: false }
  );

  // Prepare knowledge base documents from selected documents
  const knowledgeBaseDocuments = [];
  if (selected_documents && selected_documents.length > 0) {
    // Security: Validate document IDs are valid MongoDB ObjectIds to prevent NoSQL injection
    const validDocumentIds = selected_documents.filter(id => {
      if (!id) return false;
      const idStr = id.toString();
      return /^[0-9a-fA-F]{24}$/.test(idStr);
    });
    
    if (validDocumentIds.length === 0) {
      console.warn('⚠️ No valid document IDs provided, skipping knowledge base documents');
    } else {
      // Fetch document details from AgentDocuments
      const documents = await AgentDocuments.find({ _id: { $in: validDocumentIds } });
      knowledgeBaseDocuments.push(...documents.map(doc => ({
        document_id: doc._id.toString(),
        filename: doc.filename,
        original_name: doc.original_name,
        file_type: doc.file_type,
        file_size: doc.file_size,
        file_path: doc.file_path,
        upload_date: doc.upload_date
      })));
      console.log('Knowledge base documents prepared:', knowledgeBaseDocuments);
    }
  }

  // Create new caller phone record
  const callerPhone = new CallerPhone({
    user_id: userId,
    campaign_id: campaignId,
    caller_number,
    caller_status,
    objectid,
    metadata: metadata || {},
    is_active: true,
    knowledge_base: {
      documents: knowledgeBaseDocuments,
      total_documents: knowledgeBaseDocuments.length,
      last_updated: new Date()
    }
  });

  await callerPhone.save();

  // Update campaign with assigned phone number
  campaign.assigned_phone_number = caller_number;
  
  // Ensure schedule exists with start_date to avoid validation error
  if (!campaign.schedule || !campaign.schedule.start_date) {
    campaign.schedule = campaign.schedule || {};
    campaign.schedule.start_date = campaign.schedule.start_date || new Date();
    campaign.schedule.end_date = campaign.schedule.end_date || null;
    campaign.schedule.timezone = campaign.schedule.timezone || 'UTC';
    campaign.schedule.call_frequency = campaign.schedule.call_frequency || {
      calls_per_hour: 10,
      max_concurrent_calls: 3
    };
    campaign.markModified('schedule');
  }

  // Fix invalid campaign status values if they exist
  // Also ensure new campaigns without millis_campaign_id or not started should be 'draft', not 'active'
  const validStatuses = ['draft', 'pending_approval', 'approved', 'rejected', 'active', 'paused', 'completed', 'idle'];
  
  // If campaign has invalid status
  if (campaign.status && !validStatuses.includes(campaign.status)) {
    console.log(`Fixing invalid campaign.status: ${campaign.status} -> draft`);
    campaign.status = 'draft';
  } else if (campaign.status === 'active' && (!campaign.millis_campaign_id || !campaign.stats?.total_calls)) {
    // If campaign is marked 'active' but hasn't been started on Millis (no millis_campaign_id or no calls), set to 'draft'
    console.log(`Campaign incorrectly marked as 'active' without Millis campaign or calls. Setting to 'draft'`);
    campaign.status = 'draft';
  } else if (!campaign.status || campaign.status === 'idle') {
    // Ensure campaigns without a status or with 'idle' are set to 'draft'
    campaign.status = 'draft';
  }

  // Fix invalid approval.status values if they exist
  if (campaign.approval && campaign.approval.status && !['pending', 'approved', 'rejected'].includes(campaign.approval.status)) {
    console.log(`Fixing invalid approval.status: ${campaign.approval.status} -> pending`);
    campaign.approval.status = 'pending';
    campaign.markModified('approval');
  }
  
  // Add caller phone to target_numbers with is_caller flag
  const existingCallerIndex = campaign.target_numbers.findIndex(
    num => num.metadata?.is_caller === true
  );
  
  if (existingCallerIndex >= 0) {
    // Update existing caller entry
    campaign.target_numbers[existingCallerIndex] = {
      phone: caller_number,
      name: 'Caller Phone',
      metadata: { is_caller: true, objectid, caller_status }
    };
  } else {
    // Add new caller entry
    campaign.target_numbers.push({
      phone: caller_number,
      name: 'Caller Phone',
      metadata: { is_caller: true, objectid, caller_status }
    });
  }

  // Try to save campaign, but don't fail the entire operation if it fails
  let campaignUpdated = false;
  try {
    await campaign.save();
    campaignUpdated = true;
    console.log('Campaign updated successfully');
  } catch (error) {
    console.error('Error saving campaign:', error);
    // If it's a validation error, log it but continue
    if (error.name === 'ValidationError') {
      console.error('Validation error details:', error.errors);
      console.log('Continuing despite validation error - caller phone still set');
    }
    // Don't throw error - caller phone is already saved
  }

  console.log('Caller phone set successfully:', callerPhone);

  // Automatically sync caller phone to Millis dashboard
  let millisCampaignId = campaign.millis_campaign_id;
  
  // If campaign doesn't have a Millis ID, try to find or create it
  if (!millisCampaignId) {
    try {
      console.log('No millis_campaign_id found, looking up campaign on Millis...');
      
      // Try to find the campaign on Millis by name
      const millisCampaigns = await millis.listCampaigns({ page: 1, pageSize: 100 });
      const foundCampaign = millisCampaigns.items?.find(c => c.name === campaign.name);
      
      if (foundCampaign && foundCampaign.id) {
        millisCampaignId = foundCampaign.id;
        console.log(`Found campaign on Millis with ID: ${millisCampaignId}`);
        
        // Update local campaign with millis_campaign_id
        campaign.millis_campaign_id = millisCampaignId;
        await campaign.save();
      } else {
        // Create new campaign on Millis
        console.log('Campaign not found on Millis, creating new one...');
        const newCampaign = await millis.createCampaign({ name: campaign.name });
        
        if (newCampaign && newCampaign.id) {
          millisCampaignId = newCampaign.id;
          console.log(`Created new campaign on Millis with ID: ${millisCampaignId}`);
          
          // Update local campaign with millis_campaign_id
          campaign.millis_campaign_id = millisCampaignId;
          await campaign.save();
        }
      }
    } catch (lookupError) {
      console.warn('Failed to lookup/create campaign on Millis:', lookupError.message);
      // Continue without millis_campaign_id
    }
  }
  
  // Now try to sync caller phone to Millis campaign
  if (millisCampaignId) {
    try {
      console.log(`Syncing caller phone ${caller_number} to Millis campaign ${millisCampaignId}...`);
      
      // First, ensure the phone exists on Millis by trying to list it
      let phoneExists = false;
      try {
        const phones = await millis.listPhones({ page: 1, pageSize: 100 });
        phoneExists = phones.items?.some(p => p.phone === caller_number || p.phone_number === caller_number);
        
        if (!phoneExists) {
          console.warn(`Phone ${caller_number} not found in Millis. Attempting to import...`);
          
          // Try to import the phone from ExotelPhone record
          const ExotelPhone = require('../models/ExotelPhone');
          const exotelPhone = await ExotelPhone.findOne({
            phone_number: caller_number,
            user_id: userId
          });
          
          if (exotelPhone && exotelPhone.api_key && exotelPhone.api_token) {
            try {
              const importPayload = {
                provider: exotelPhone.provider || 'exotel',
                phone: caller_number,
                country: exotelPhone.country || 'United States (+1)',
                region: exotelPhone.region || 'us-west',
                api_key: exotelPhone.api_key,
                api_token: exotelPhone.api_token,
                sid: exotelPhone.account_sid || '',
                subdomain: exotelPhone.subdomain || '',
                app_id: exotelPhone.app_id || null
              };
              
              console.log('Importing phone to Millis:', importPayload);
              await millis.importPhones(importPayload);
              
              console.log(`✓ Phone ${caller_number} imported to Millis successfully`);
              phoneExists = true;
            } catch (importError) {
              console.error('Failed to import phone to Millis:', importError.message);
              // Continue to try setting the caller anyway
            }
          } else {
            console.warn('ExotelPhone record not found or missing credentials for auto-import');
          }
        } else {
          console.log(`Phone ${caller_number} found in Millis`);
        }
      } catch (phoneCheckError) {
        console.warn('Could not verify phone existence on Millis:', phoneCheckError.message);
      }
      
      // Call Millis API to set the caller phone for the campaign
      // Millis API expects "caller" field with phone number
      const setCallerPayload = {
        caller: caller_number
      };

      console.log('Calling Millis API:', `/campaigns/${millisCampaignId}/set_caller`);
      console.log('Payload:', setCallerPayload);

      const millisResponse = await millis.axios.post(
        `/campaigns/${millisCampaignId}/set_caller`,
        setCallerPayload
      );

      console.log('✓ Millis caller phone set successfully:', millisResponse.data);
    } catch (millisError) {
      // Don't fail the main operation if Millis sync fails
      const errorDetails = millisError.response?.data || millisError.message;
      const errorDetail = typeof errorDetails === 'object' ? errorDetails.detail || errorDetails : errorDetails;
      
      console.error('✗ Failed to sync caller phone to Millis campaign:', {
        campaign_id: millisCampaignId,
        phone: caller_number,
        error: millisError.message,
        status: millisError.response?.status,
        details: errorDetail
      });
      
      // Check if it's a known recoverable error
      if (millisError.response?.status === 404 || errorDetail?.includes('Invalid') || errorDetail?.includes('not found')) {
        console.warn(`Phone ${caller_number} or campaign ${millisCampaignId} not found in Millis - will continue with phone agent sync`);
      }
      // Continue without throwing error to maintain existing functionality
    }
  } else {
    console.log('No millis_campaign_id available, skipping Millis campaign caller sync');
  }
  
  // Also try to set the agent for this phone on Millis (works regardless of campaign)
  try {
    // Find the ExotelPhone record to get the assigned agent
    const ExotelPhone = require('../models/ExotelPhone');
    const VoiceAgent = require('../models/VoiceAgent');
    const exotelPhone = await ExotelPhone.findOne({
      phone_number: caller_number,
      user_id: userId
    });
    
    let agentId = null;
    
    // First, try to get agent ID from ExotelPhone
    if (exotelPhone && exotelPhone.millis_agent_id) {
      agentId = exotelPhone.millis_agent_id;
      console.log(`Found agent ${agentId} from ExotelPhone record`);
    } else if (campaign.assigned_agent_id) {
      // If ExotelPhone doesn't have an agent, check if campaign has an assigned agent
      const voiceAgent = await VoiceAgent.findById(campaign.assigned_agent_id);
      if (voiceAgent && voiceAgent.millis_agent_id) {
        agentId = voiceAgent.millis_agent_id;
        console.log(`Found agent ${agentId} from campaign's assigned agent`);
      }
    }
    
    if (agentId) {
      console.log(`Setting agent ${agentId} for phone ${caller_number} on Millis...`);
      
      // Use phone number as identifier (same as admin controller)
      await millis.setPhoneAgent(caller_number, {
        agentId: agentId
      });
      
      console.log(`Agent ${agentId} set for phone ${caller_number} on Millis successfully`);
    } else {
      console.log('No agent found to assign to this phone');
    }
  } catch (agentError) {
    console.warn('Failed to set agent for phone on Millis:', agentError.message);
    // Don't fail the main operation
  }

  // After setting caller phone, try to sync status from Millis if campaign exists there
  if (campaign.millis_campaign_id) {
    try {
      // Sync campaign status from Millis
      const millisCampaign = await millis.axios.get(`/campaigns/${campaign.millis_campaign_id}`);
      if (millisCampaign.data && millisCampaign.data.status) {
        const statusMap = {
          'idle': 'draft',
          'draft': 'draft',
          'active': 'active',
          'running': 'running',
          'paused': 'paused',
          'finished': 'completed',
          'completed': 'completed'
        };
        const mappedStatus = statusMap[millisCampaign.data.status] || campaign.status;
        if (mappedStatus !== campaign.status) {
          campaign.status = mappedStatus;
          await campaign.save();
          console.log(`Campaign status synced from Millis: ${campaign.status}`);
        }
      }
    } catch (statusSyncErr) {
      console.warn('Could not sync campaign status from Millis after setting caller phone:', statusSyncErr.message);
      // Continue without failing
    }
  }

  return res.status(200).json({
    success: true,
    message: campaignUpdated 
      ? 'Caller phone set and campaign updated successfully'
      : 'Caller phone set successfully (campaign update skipped)',
    caller_phone: callerPhone,
    campaign: {
      id: campaign._id,
      assigned_phone_number: campaign.assigned_phone_number,
      target_numbers: campaign.target_numbers,
      status: campaign.status // Include synced status in response
    }
  });
});

// Get caller phone for a campaign
const getCallerPhone = asyncHandler(async (req, res) => {
  const { campaignId } = req.params;
  const userId = req.user.id;

  console.log('Getting caller phone for campaign:', campaignId);

  // Check if campaign exists and belongs to user
  const campaign = await Campaign.findOne({ _id: campaignId, user_id: userId });
  if (!campaign) {
    return res.status(404).json({ 
      success: false, 
      error: 'Campaign not found or access denied' 
    });
  }

  // Get active caller phone for this campaign
  const callerPhone = await CallerPhone.findOne({
    campaign_id: campaignId,
    is_active: true
  });

  if (!callerPhone) {
    return res.status(200).json({
      success: true,
      message: 'No caller phone set for this campaign',
      caller_phone: null
    });
  }

  console.log('Caller phone found:', callerPhone);

  return res.status(200).json({
    success: true,
    caller_phone: callerPhone
  });
});

// Get all caller phones for a user
const getUserCallerPhones = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 10, status } = req.query;

  console.log('Getting caller phones for user:', userId);

  const query = { user_id: userId };
  if (status) {
    query.caller_status = status;
  }

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { createdAt: -1 },
    populate: [
      { path: 'campaign_id', select: 'name status' }
    ]
  };

  const callerPhones = await CallerPhone.paginate(query, options);

  console.log('Caller phones found:', callerPhones.totalDocs);

  return res.status(200).json({
    success: true,
    ...callerPhones
  });
});

// Update caller phone status
const updateCallerPhoneStatus = asyncHandler(async (req, res) => {
  const { callerPhoneId } = req.params;
  const { caller_status } = req.body;
  const userId = req.user.id;

  console.log('Updating caller phone status:', { callerPhoneId, caller_status });

  const callerPhone = await CallerPhone.findOneAndUpdate(
    { _id: callerPhoneId, user_id: userId },
    { caller_status },
    { new: true }
  );

  if (!callerPhone) {
    return res.status(404).json({ 
      success: false, 
      error: 'Caller phone not found or access denied' 
    });
  }

  console.log('Caller phone status updated:', callerPhone);

  return res.status(200).json({
    success: true,
    message: 'Caller phone status updated successfully',
    caller_phone: callerPhone
  });
});

// Deactivate caller phone
const deactivateCallerPhone = asyncHandler(async (req, res) => {
  const { callerPhoneId } = req.params;
  const userId = req.user.id;

  console.log('Deactivating caller phone:', callerPhoneId);

  const callerPhone = await CallerPhone.findOneAndUpdate(
    { _id: callerPhoneId, user_id: userId },
    { is_active: false },
    { new: true }
  );

  if (!callerPhone) {
    return res.status(404).json({ 
      success: false, 
      error: 'Caller phone not found or access denied' 
    });
  }

  // Remove caller phone from campaign target_numbers
  const campaign = await Campaign.findById(callerPhone.campaign_id);
  if (campaign) {
    campaign.target_numbers = campaign.target_numbers.filter(
      num => !num.metadata?.is_caller
    );
    campaign.assigned_phone_number = '';
    await campaign.save();
  }

  console.log('Caller phone deactivated:', callerPhone);

  return res.status(200).json({
    success: true,
    message: 'Caller phone deactivated successfully',
    caller_phone: callerPhone
  });
});

// Get agent documents for a user
const getAgentDocuments = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { campaignId, page = 1, limit = 10, fileType } = req.query;

  console.log('Getting agent documents for user:', userId);

  const query = { user_id: userId };
  if (campaignId && campaignId !== 'default-campaign-id') {
    query.campaign_id = campaignId;
  }
  if (fileType) {
    query.file_type = fileType;
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  try {
    // Get total count
    const totalDocs = await AgentDocuments.countDocuments(query);
    
    // Get documents with pagination
    const documents = await AgentDocuments.find(query)
      .populate('campaign_id', 'name status')
      .sort({ upload_date: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalPages = Math.ceil(totalDocs / limitNum);

    console.log('Agent documents found:', totalDocs);

    return res.status(200).json({
      success: true,
      docs: documents,
      totalDocs: totalDocs,
      limit: limitNum,
      page: pageNum,
      totalPages: totalPages,
      hasNextPage: pageNum < totalPages,
      nextPage: pageNum < totalPages ? pageNum + 1 : null,
      hasPrevPage: pageNum > 1,
      prevPage: pageNum > 1 ? pageNum - 1 : null
    });
  } catch (error) {
    console.error('Error fetching agent documents:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch documents'
    });
  }
});

// Delete agent document
const deleteAgentDocument = asyncHandler(async (req, res) => {
  const { documentId } = req.params;
  const userId = req.user.id;

  console.log('Deleting agent document:', documentId);

  const document = await AgentDocuments.findOne({ 
    _id: documentId, 
    user_id: userId 
  });

  if (!document) {
    return res.status(404).json({
      success: false,
      error: 'Document not found or access denied'
    });
  }

  // Delete file from filesystem
  if (fs.existsSync(document.file_path)) {
    fs.unlinkSync(document.file_path);
  }

  // Remove from database
  await AgentDocuments.findByIdAndDelete(documentId);

  console.log('Agent document deleted successfully');

  return res.status(200).json({
    success: true,
    message: 'Document deleted successfully'
  });
});

module.exports = {
  uploadKnowledgeBaseDocument,
  getKnowledgeBaseDocuments,
  deleteKnowledgeBaseDocument,
  getAgentDocuments,
  deleteAgentDocument,
  setCallerPhone,
  getCallerPhone,
  getUserCallerPhones,
  updateCallerPhoneStatus,
  deactivateCallerPhone,
  upload // Export multer upload middleware
};
