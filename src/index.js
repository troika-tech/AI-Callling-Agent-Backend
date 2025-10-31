const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const cfg = require("./config");
const { connectMongo } = require("./db");
const { resolveClientIp } = require("./lib/request");

const health = require("./routes/health");
const authRoutes = require('./routes/auth');
const meRoutes = require('./routes/me');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const rateLimitResetRoutes = require('./routes/rate-limit-reset');
const adminAgentsRoutes = require('./routes/admin/agents');
const adminPhonesRoutes = require('./routes/admin/phones');
const adminCampaignsRoutes = require('./routes/admin/campaigns');
const adminCallsRoutes = require('./routes/admin/calls');
const adminUsersRoutes = require('./routes/admin/users');
const adminOverviewRoutes = require('./routes/admin/overview');
const adminLogsRoutes = require('./routes/admin/logs');
const dashboardRoutes = require('./routes/dashboard');
const callerPhoneRoutes = require('./routes/callerPhone');

// Phase 3 - Inbound routes
const millisWebhookRoutes = require('./routes/webhooks/millis');
const exotelWebhookRoutes = require('./routes/webhooks/exotel');
const inboundCallsRoutes = require('./routes/inbound/calls');
const inboundLeadsRoutes = require('./routes/inbound/leads');
const inboundAnalyticsRoutes = require('./routes/inbound/analytics');

// Phase 4 - Outbound routes
const outboundCampaignsRoutes = require('./routes/outbound/campaigns');
const outboundAnalyticsRoutes = require('./routes/outbound/analytics');
const outboundLeadsRoutes = require('./routes/outbound/leads');
const outboundCallsRoutes = require('./routes/outbound/calls');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false
  }));

  // Security: Restrict CORS in production - "*" is a security risk
  let corsOrigin = cfg.corsOrigins.includes("*") ? true : cfg.corsOrigins;
  if (cfg.env === 'production' && corsOrigin === true) {
    console.warn('⚠️ WARNING: CORS is set to "*" in production. This is a security risk!');
    console.warn('⚠️ Please set CORS_ORIGINS environment variable to specific domains.');
    // In production, default to empty array if wildcard detected (more secure)
    corsOrigin = [];
  }

  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Range'],
      exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type']
    })
  );

  app.use(morgan(cfg.env === "production" ? "combined" : "dev"));

  const whitelistedIPs = cfg.rateLimit.whitelistedIPs;

  const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300, // Increased for development
    message: { error: 'Too many admin requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const clientIP = resolveClientIp(req);
      return clientIP ? whitelistedIPs.includes(clientIP) : false;
    }
  });

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000, // Increased for development
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const clientIP = resolveClientIp(req);
      return clientIP ? whitelistedIPs.includes(clientIP) : false;
    }
  });

  app.use("/api/v1/health", health);
  app.use("/api/v1/rate-limit", rateLimitResetRoutes);
  app.use("/api/v1/auth", generalLimiter, authRoutes);
  app.use("/api/v1/me", generalLimiter, meRoutes);
  app.use("/api/v1/user", generalLimiter, userRoutes);

  // Phase 3 - Webhook routes (no rate limiting for webhooks)
  app.use("/api/webhooks", millisWebhookRoutes);
  app.use("/api/webhooks/exotel", exotelWebhookRoutes);
  
  // Recording proxy routes (no authentication needed for audio streaming)
  app.use("/api/v1/calls", outboundCallsRoutes);

  const adminRouter = express.Router();
  adminRouter.use(adminRoutes);
  adminRouter.use('/agents', adminAgentsRoutes);
  adminRouter.use('/phones', adminPhonesRoutes);
  adminRouter.use('/campaigns', adminCampaignsRoutes);
  adminRouter.use('/users', adminUsersRoutes);
  adminRouter.use('/stats', adminOverviewRoutes);
  adminRouter.use('/logs', adminLogsRoutes);
  adminRouter.use('/', adminCallsRoutes);

  app.use("/api/v1/admin", adminLimiter, adminRouter);
  
  // Phase 3 - Inbound routes
  app.use("/api/v1/inbound/calls", generalLimiter, inboundCallsRoutes);
  app.use("/api/v1/inbound/leads", generalLimiter, inboundLeadsRoutes);
  app.use("/api/v1/inbound/analytics", generalLimiter, inboundAnalyticsRoutes);
  
  // Phase 4 - Outbound routes
  app.use("/api/v1/outbound/campaigns", generalLimiter, outboundCampaignsRoutes);
  app.use("/api/v1/outbound/campaigns", generalLimiter, outboundAnalyticsRoutes);
  app.use("/api/v1/outbound/campaigns", generalLimiter, outboundLeadsRoutes);
  
  // Caller phone routes
  app.use("/api/v1", generalLimiter, callerPhoneRoutes);
  
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/v1/")) {
      return next();
    }
    generalLimiter(req, res, (err) => {
      if (err) return next(err);
      dashboardRoutes(req, res, next);
    });
  });

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  app.use((err, _req, res, _next) => {
    // Don't log expected authentication errors (401, 400 for missing tokens)
    // These are normal after logout or for unauthenticated requests
    const isExpectedAuthError = err.status === 401 || 
                                 (err.status === 400 && (err.message?.includes('token') || err.message?.includes('refresh token'))) ||
                                 err.name === 'UnauthorizedError' ||
                                 (err.name === 'TokenExpiredError' && _req.path?.includes('/refresh'));
    
    if (!isExpectedAuthError) {
      console.error('Error:', err);
    }

    if (err.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.message
      });
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }

    if (err.status) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code
      });
    }

    if (typeof err.message === 'string' && err.message.includes('Millis API')) {
      return res.status(502).json({
        error: 'External service error',
        code: 'EXTERNAL_SERVICE_ERROR'
      });
    }

    res.status(500).json({
      error: cfg.env === 'production' ? 'Internal Server Error' : err.message,
      code: 'INTERNAL_ERROR'
    });
  });

  return app;
}

const app = createApp();

async function start() {
  await connectMongo();

  const server = app.listen(cfg.port, () => {
    console.log(`API listening on http://localhost:${cfg.port} (env=${cfg.env})`);
  });

  // Initialize Socket.IO for real-time features (Phase 5)
  const { initializeSocket } = require('./services/socketService');
  initializeSocket(server);

  // Start campaign monitor (Phase 5)
  const { startCampaignMonitor } = require('./services/campaignMonitor');
  startCampaignMonitor();

  return server;
}

if (require.main === module) {
  start().catch((e) => {
    console.error("Failed to start server:", e);
    process.exit(1);
  });
}

module.exports = app;
module.exports.createApp = createApp;
module.exports.start = start;
