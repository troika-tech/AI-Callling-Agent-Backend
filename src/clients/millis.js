const axios = require('axios');
const cfg = require('../config');

console.log('[Millis Client] Initializing...');
console.log('[Millis Client] Base URL:', cfg.millis.baseURL);
console.log('[Millis Client] API Key present:', !!cfg.millis.apiKey);
console.log('[Millis Client] API Key length:', cfg.millis.apiKey ? cfg.millis.apiKey.length : 0);

const millis = axios.create({
  baseURL: cfg.millis.baseURL,
  timeout: 30000, // Increased to 30 seconds for large call logs responses
  headers: {
    Authorization: cfg.millis.apiKey,
    'Content-Type': 'application/json'
  }
});

function toMillisError(error) {
  if (error.response) {
    const { status, data, headers } = error.response;
    const type = status >= 500 ? 'server' : 'client';
    const detail = data?.message || data?.error || status;
    const err = new Error(`Millis API ${type} error: ${detail}`);
    err.status = status;
    err.data = data;
    err.headers = headers;
    return err;
  }

  if (error.code === 'ECONNABORTED') {
    const err = new Error('Millis API timeout');
    err.status = 504;
    return err;
  }

  const err = new Error(`Millis API connection error: ${error.message}`);
  err.status = 502;
  return err;
}

const handleMillisError = (error) => {
  throw toMillisError(error);
};

const apiCall = (method, url, ...args) => {
  console.log(`[Millis API Call] ${method.toUpperCase()} ${url}`);
  console.log(`[Millis API] Args:`, args);
  
  return millis[method](url, ...args)
    .then(r => {
      console.log(`[Millis API Response] ${method.toUpperCase()} ${url} - Success`);
      return r.data;
    })
    .catch(error => {
      console.error(`[Millis API Error] ${method.toUpperCase()} ${url}`);
      console.error(`[Millis API] Error details:`, error.response?.data || error.message);
      throw handleMillisError(error);
    });
};

const streamCallRecording = async (sessionId, headers = {}) => {
  try {
    // Try /histories endpoint first (as shown in Millis dashboard)
    // If that fails, fall back to /call-logs
    try {
      console.log(`[Millis API] Attempting to stream recording via /histories/${sessionId}/recording`);
      return await millis.get(`/histories/${sessionId}/recording`, {
        responseType: 'stream',
        headers
      });
    } catch (historiesError) {
      // Fall back to /call-logs if /histories doesn't work
      console.log(`⚠️ /histories endpoint failed (${historiesError.response?.status || historiesError.message}), trying /call-logs`);
      return await millis.get(`/call-logs/${sessionId}/recording`, {
        responseType: 'stream',
        headers
      });
    }
  } catch (error) {
    // Enhanced error logging for 405 errors
    if (error.response && error.response.status === 405) {
      console.error(`[Millis API] 405 Method Not Allowed for session ${sessionId}`);
      console.error(`[Millis API] Allowed methods: ${error.response.headers?.['allow'] || 'unknown'}`);
      console.error(`[Millis API] This recording endpoint may not support GET requests`);
    }
    throw toMillisError(error);
  }
};

module.exports = {
  // Raw axios instance for direct API calls
  axios: millis,
  
  // User info
  getUserInfo: () => apiCall('get', '/user/info'),

  // Agents
  listAgents: (params) => apiCall('get', '/agents', { params }),
  createAgent: (payload) => apiCall('post', '/agents', payload),

  // Phones
  listPhones: (params) => apiCall('get', '/phones', { params }),
  importPhones: (payload) => apiCall('post', '/phones/import', payload),
  setPhoneAgent: (phoneId, payload) => apiCall('post', `/phones/${phoneId}/set_agent`, payload),
  updatePhoneTags: (phoneId, payload) => apiCall('post', `/phones/${phoneId}/tags`, payload),
  getPhoneDetail: (phoneId) => apiCall('get', `/phones/${phoneId}`),

  // Knowledge Base
  listKnowledgeFiles: (params) => apiCall('get', '/knowledge/list_files', { params }),
  createKnowledgeFile: (payload) => apiCall('post', '/knowledge/create_file', payload),
  deleteKnowledgeFile: (payload) => apiCall('post', '/knowledge/delete_file', payload),
  setAgentFiles: (payload) => apiCall('post', '/knowledge/set_agent_files', payload),

  // Campaigns
  listCampaigns: (params) => apiCall('get', '/campaigns', { params }),
  createCampaign: (payload) => apiCall('post', '/campaigns', payload),
  getCampaignDetail: (campaignId) => apiCall('get', `/campaigns/${campaignId}`),
  getCampaignInfo: (campaignId) => apiCall('get', `/campaigns/${campaignId}/info`),
  approveCampaign: (campaignId, payload) => apiCall('post', `/campaigns/${campaignId}/approve`, payload),
  
  // Campaign Records
  getCampaignRecords: (campaignId) => apiCall('get', `/campaigns/${campaignId}`),
  addCampaignRecords: (campaignId, payload) => apiCall('post', `/campaigns/${campaignId}/records`, payload),
  deleteCampaignRecord: (campaignId, phone) => apiCall('delete', `/campaigns/${campaignId}/records/${phone}`),

  // Calls
  listCallLogs: (params) => apiCall('get', '/call-logs', { params }),
  getCallDetail: (sessionId) => apiCall('get', `/call-logs/${sessionId}`),
  getCallRecording: (sessionId) => apiCall('get', `/call-logs/${sessionId}/recording`),
  streamCallRecording,
};