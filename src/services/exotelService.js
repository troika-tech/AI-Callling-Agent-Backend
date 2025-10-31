const axios = require('axios');

// Build Exotel API client per credential set (v2)
function buildClientV2({ subdomain, account_sid, api_key, api_token }) {
  const normalizedSubdomain = normalizeSubdomain(subdomain);
  const baseURL = `https://${normalizedSubdomain}.exotel.com/v2/accounts/${account_sid}`;
  // Debug: log the base URL we're about to use (without credentials)
  try {
    console.log('[Exotel] Using base URL:', baseURL);
  } catch (_) {}
  const client = axios.create({
    baseURL,
    timeout: 20000,
    auth: {
      username: api_key || account_sid, // support either key or SID as username
      password: api_token || ''
    }
  });
  return client;
}

// Build Exotel API client for v1
function buildClientV1({ subdomain, account_sid, api_key, api_token }) {
  const normalizedSubdomain = normalizeSubdomain(subdomain);
  const baseURL = `https://${normalizedSubdomain}.exotel.com/v1/Accounts/${account_sid}`;
  try {
    console.log('[Exotel] Using base URL (v1):', baseURL);
  } catch (_) {}
  const client = axios.create({
    baseURL,
    timeout: 20000,
    auth: {
      username: api_key || account_sid,
      password: api_token || ''
    }
  });
  return client;
}

function normalizeSubdomain(input) {
  if (!input) return 'api';
  const raw = String(input).trim().toLowerCase();
  // Strip protocol if present
  const noProtocol = raw.replace(/^https?:\/\//, '');
  // If a full domain was provided, remove the rest to keep only the first label
  const withoutDomain = noProtocol.replace(/\.exotel\.com.*$/, '');
  const firstLabel = withoutDomain.split('.')[0];
  return firstLabel || 'api';
}

async function fetchInboundCalls(credentials, { from, to, page = 1, pageSize = 50 }) {
  const client = buildClientV2(credentials);
  const params = new URLSearchParams();
  params.append('direction', 'incoming');
  if (from) params.append('from', from);
  if (to) params.append('to', to);
  params.append('page', page);
  params.append('page_size', pageSize);

  const url = `/calls?${params.toString()}`;
  try {
    const { data } = await client.get(url);
    // Normalize common shapes; Exotel responses vary by account/version
    const items = normalizeItems(data);
    return Array.isArray(items) ? items : [];
  } catch (err) {
    try {
      console.error('[Exotel] Request failed:', {
        url: client.defaults.baseURL + url,
        code: err.code,
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      });
    } catch (_) {}
    // If v2 is not supported, fallback to v1
    const message = (err?.response?.data && typeof err.response.data === 'string') ? err.response.data : '';
    if (err?.response?.status === 400 && message.includes('Exotel API Version v2 not supported')) {
      return fetchInboundCallsV1(credentials, { from, to, page, pageSize });
    }
    if (err.response && err.response.data) {
      const e = new Error(err.message);
      e.status = err.response.status;
      e.data = err.response.data;
      throw e;
    }
    throw err;
  }
}

async function fetchInboundCallsV1(credentials, { from, to, page = 1, pageSize = 50 }) {
  const client = buildClientV1(credentials);
  const params = new URLSearchParams();
  // v1 may not support these filters consistently; attempt best-effort
  if (from) params.append('From', from);
  if (to) params.append('To', to);
  // Pagination params for v1 are not standardized; omit for compatibility

  const url = `/Calls.json${params.toString() ? `?${params.toString()}` : ''}`;
  try {
    const { data } = await client.get(url);
    // v1 typically returns { Calls: [...] } or a wrapper with nested list
    const items = normalizeItems(data);
    return Array.isArray(items) ? items : [];
  } catch (err) {
    try {
      console.error('[Exotel v1] Request failed:', {
        url: client.defaults.baseURL + url,
        code: err.code,
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      });
    } catch (_) {}
    throw err;
  }
}

function normalizeItems(data) {
  if (!data) return [];
  // v2 variants
  if (Array.isArray(data.calls)) return data.calls;
  if (Array.isArray(data.records)) return data.records;
  if (Array.isArray(data.items)) return data.items;
  // v1 variants
  if (Array.isArray(data.Calls)) return data.Calls;
  if (data.Call && Array.isArray(data.Call)) return data.Call;
  if (data.List && Array.isArray(data.List.items)) return data.List.items;
  return [];
}

module.exports = {
  fetchInboundCalls,
};


