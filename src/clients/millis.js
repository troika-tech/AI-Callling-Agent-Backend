const axios = require('axios');
const cfg = require('../config');

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

const apiCall = (method, url, ...args) =>
  millis[method](url, ...args)
    .then(r => r.data)
    .catch(handleMillisError);

const streamCallRecording = async (sessionId, headers = {}) => {
  try {
    return await millis.get(`/call_logs/${sessionId}/recording`, {
      responseType: 'stream',
      headers
    });
  } catch (error) {
    throw toMillisError(error);
  }
};

module.exports = {
  // User info
  getUserInfo: () => apiCall('get', '/user/info'),

  // Agents
  listAgents: (params) => apiCall('get', '/agents', { params }),

  // Phones
  listPhones: (params) => apiCall('get', '/phones', { params }),
  importPhones: (payload) => apiCall('post', '/phones/import', payload),
  setPhoneAgent: (phoneId, payload) => apiCall('post', `/phones/${phoneId}/set_agent`, payload),
  updatePhoneTags: (phoneId, payload) => apiCall('post', `/phones/${phoneId}/tags`, payload),
  getPhoneDetail: (phoneId) => apiCall('get', `/phones/${phoneId}`),

  // Campaigns
  listCampaigns: (params) => apiCall('get', '/campaigns', { params }),
  getCampaignDetail: (campaignId) => apiCall('get', `/campaigns/${campaignId}`),
  getCampaignInfo: (campaignId) => apiCall('get', `/campaigns/${campaignId}/info`),
  approveCampaign: (campaignId, payload) => apiCall('post', `/campaigns/${campaignId}/approve`, payload),

  // Calls
  listCallLogs: (params) => apiCall('get', '/call-logs', { params }),
  getCallDetail: (sessionId) => apiCall('get', `/call-logs/${sessionId}`),
  getCallRecording: (sessionId) => apiCall('get', `/call-logs/${sessionId}/recording`),
  streamCallRecording,
};