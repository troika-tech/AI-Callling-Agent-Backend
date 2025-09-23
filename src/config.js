require('dotenv').config();

const cfg = {
  env: process.env.NODE_ENV || 'development',
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
};

module.exports = cfg;
