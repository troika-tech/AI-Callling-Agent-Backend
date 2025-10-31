const millis = require('../../clients/millis');
const Phone = require('../../models/Phone');
const AdminAudit = require('../../models/AdminAudit');
const asyncHandler = require('../../middleware/asyncHandler');
const { standardizeListResponse, createAuditLog, getClientInfo } = require('../../lib/responseUtils');

exports.list = asyncHandler(async (req, res) => {
  const { page = 1, pageSize = 50, search } = req.query;
  const pageNumber = Number.parseInt(page, 10) || 1;
  const pageSizeNumber = Number.parseInt(pageSize, 10) || 50;
  const searchTerm = typeof search === 'string' && search.length ? search : undefined;

  const data = await millis.listPhones({
    page: pageNumber,
    pageSize: pageSizeNumber,
    search: searchTerm
  });

  // Millis returns array directly, not {items: [...]}
  const phones = Array.isArray(data) ? data : (data.items || []);

  // Sync phones to local database
  for (const p of phones) {
    await Phone.updateOne({ phoneId: p.id }, {
      $set: {
        number: p.id, // Millis uses 'id' as the phone number
        tags: p.tags || [],
        agentId: p.agent_id || null, // Millis uses snake_case
        status: p.status || 'active',
        createdAt: p.create_at ? new Date(p.create_at * 1000) : new Date(),
        meta: p
      }
    }, { upsert: true });
  }

  const response = standardizeListResponse(data, pageNumber, pageSizeNumber);
  res.json(response);
});

exports.import = asyncHandler(async (req, res) => {
  const payload = req.body;
  
  console.log('Importing phones to Millis:', payload);
  
  try {
    // Handle both bulk import (phones array) and single Exotel import
    let millisPayload = payload;
    
    // If it's a single Exotel phone import, format it properly
    if (payload.phone && !payload.phones) {
      millisPayload = {
        phone: payload.phone,
        country: payload.country || 'IN',
        region: payload.region || 'IN',
        provider: payload.provider || 'exotel',
        api_key: payload.api_key || '',
        api_token: payload.api_token || '',
        sid: payload.sid || '',
        subdomain: payload.subdomain || ''
      };
    }
    
    // Call Millis API to import phones
    const result = await millis.importPhones(millisPayload);
    
    console.log('Millis import result:', result);
    
    // Store the phone record locally for tracking
    const phoneNumber = payload.phone || payload.phones?.[0];
    if (phoneNumber) {
      await Phone.updateOne(
        { phoneId: phoneNumber },
        { 
          $set: { 
            number: phoneNumber,
            tags: [],
            status: 'importing',
            importedAt: new Date(),
            provider: payload.provider || 'exotel',
            metadata: payload
          }
        }, 
        { upsert: true }
      );
    }
    
    // Create audit log
    await createAuditLog(AdminAudit, {
      actor: req.user._id,
      action: 'import_phones',
      target: phoneNumber || 'phones',
      targetType: payload.phone ? 'phone' : 'bulk',
      details: { 
        count: payload.phones?.length || 1,
        provider: payload.provider || 'exotel',
        phone: phoneNumber
      },
      millisResponse: result,
      ...getClientInfo(req)
    });
    
    res.status(202).json({ 
      success: true,
      message: 'Phone imported to Millis successfully', 
      result 
    });
  } catch (error) {
    console.error('Error importing phone to Millis:', error);
    
    // Return a more user-friendly error message
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to import phone to Millis',
      details: error.response?.data || error.data
    });
  }
});

exports.setAgent = asyncHandler(async (req, res) => {
  const { phone } = req.params;
  const { agentId } = req.body;
  const clientInfo = getClientInfo(req);

  const currentPhone = await Phone.findOne({ phoneId: phone });
  const oldAgentId = currentPhone?.agentId;

  const out = await millis.setPhoneAgent(phone, { agentId });
  await Phone.updateOne({ phoneId: phone }, { $set: { agentId, meta: out } }, { upsert: true });

  await createAuditLog(AdminAudit, {
    actor: req.user._id,
    action: 'set_agent',
    target: phone,
    targetType: 'phone',
    diff: { from: oldAgentId, to: agentId },
    millisResponse: out,
    ...clientInfo
  });

  res.json({ phone, agentId, out });
});

exports.updateTags = asyncHandler(async (req, res) => {
  const { phone } = req.params;
  const { tags } = req.body;
  const clientInfo = getClientInfo(req);

  const currentPhone = await Phone.findOne({ phoneId: phone });
  const oldTags = currentPhone?.tags || [];

  const out = await millis.updatePhoneTags(phone, { tags });
  await Phone.updateOne({ phoneId: phone }, { $set: { tags, meta: out } }, { upsert: true });

  await createAuditLog(AdminAudit, {
    actor: req.user._id,
    action: 'update_tags',
    target: phone,
    targetType: 'phone',
    diff: { from: oldTags, to: tags },
    millisResponse: out,
    ...clientInfo
  });

  res.json({ phone, tags, out });
});
