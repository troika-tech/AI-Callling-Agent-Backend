require('dotenv').config();

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const env = process.env.NODE_ENV || 'development';

// Validate critical environment variables
if (!process.env.MONGO_URL && env === 'production') {
  throw new Error('MONGO_URL environment variable is required in production');
}

if (!process.env.JWT_SECRET && env === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}

const cfg = {
  env,
  port: Number(process.env.PORT || 5000),
  // CRITICAL: MONGO_URL must be set via environment variable
  mongoUrl: process.env.MONGO_URL,
  corsOrigins: (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  millis: {
    baseURL: process.env.MILLIS_BASE_URL || 'https://api-eu-west.millis.ai',
    apiKey: process.env.MILLIS_API_KEY || '',
    webhookSecret: process.env.MILLIS_WEBHOOK_SECRET || '',
  },

  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    claudeApiKey: process.env.CLAUDE_API_KEY || '',
  },

  fileUpload: {
    uploadPath: process.env.FILE_UPLOAD_PATH || './uploads',
    maxSizeMB: parsePositiveNumber(process.env.FILE_MAX_SIZE_MB, 10),
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      region: process.env.AWS_REGION || 'us-east-1',
      s3Bucket: process.env.AWS_S3_BUCKET || '',
    }
  },

  rateLimit: {
    whitelistedIPs: (process.env.RATE_LIMIT_WHITELIST || '103.232.246.21,127.0.0.1,::1,::ffff:127.0.0.1')
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