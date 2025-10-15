require('dotenv').config();

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const env = process.env.NODE_ENV || 'development';

const cfg = {
  env,
  port: Number(process.env.PORT || 4000),
  mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017/millis_saas',
  corsOrigins: (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  millis: {
    baseURL: process.env.MILLIS_BASE_URL || 'https://api-eu-west.millis.ai',
    apiKey: process.env.MILLIS_API_KEY || '',
  },

  rateLimit: {
    whitelistedIPs: (process.env.RATE_LIMIT_WHITELIST || '103.232.246.21')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  },

  auth: {
    sessionCookieName: process.env.SESSION_COOKIE_NAME || 'session',
    refreshCookieName: process.env.REFRESH_COOKIE_NAME || 'refresh_token',
    sessionTtlMs: parsePositiveNumber(process.env.SESSION_TTL_MS, 12 * 60 * 60 * 1000),
    refreshTtlMs: parsePositiveNumber(process.env.REFRESH_TTL_MS, 7 * 24 * 60 * 60 * 1000),
    sameSite: process.env.COOKIE_SAMESITE || 'None',
    secureCookies: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE.toLowerCase() === 'true' : env === 'production',
    cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  }
};

module.exports = cfg;