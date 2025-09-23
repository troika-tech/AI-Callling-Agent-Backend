const axios = require('axios');
const cfg = require('../config');

const millis = axios.create({
  baseURL: cfg.millis.baseURL,
  timeout: 10000,
  headers: {
    Authorization: cfg.millis.apiKey,
    'Content-Type': 'application/json'
  }
});

// Error handling wrapper
const handleMillisError = (error) => {
  if (error.code === 'ECONNABORTED') {
    throw new Error('Millis API timeout');
  }
  if (error.response) {
    const { status, data } = error.response;
    if (status >= 500) {
      throw new Error(`Millis API server error: ${status}`);
    }
    if (status === 429) {
      throw new Error('Millis API rate limit exceeded');
    }
    if (status >= 400) {
      throw new Error(`Millis API client error: ${data?.message || status}`);
    }
  }
  throw new Error(`Millis API connection error: ${error.message}`);
};

const apiCall = (method, url, ...args) =>
  millis[method](url, ...args)
    .then(r => r.data)
    .catch(handleMillisError);

module.exports = {
  // Agents
  listAgents: (params) => apiCall('get', '/agents', { params }),

  // Phones
  listPhones: (params) => apiCall('get', '/phones', { params }),
  importPhones: (payload) => apiCall('post', '/phones/import', payload),
  setPhoneAgent: (phoneId, payload) => apiCall('post', `/phones/${phoneId}/set_agent`, payload),
  updatePhoneTags: (phoneId, payload) => apiCall('post', `/phones/${phoneId}/tags`, payload),

  // Campaign approvals
  approveCampaign: (campaignId, payload) => apiCall('post', `/campaigns/${campaignId}/approve`, payload),

  // Calls & Sessions
  listCallLogs: (params) => apiCall('get', '/call_logs', { params }),
  listSessions: (params) => apiCall('get', '/sessions', { params }),
};
