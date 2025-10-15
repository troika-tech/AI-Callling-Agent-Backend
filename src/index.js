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
const adminAgentsRoutes = require('./routes/admin/agents');
const adminPhonesRoutes = require('./routes/admin/phones');
const adminCampaignsRoutes = require('./routes/admin/campaigns');
const adminCallsRoutes = require('./routes/admin/calls');
const adminUsersRoutes = require('./routes/admin/users');
const dashboardRoutes = require('./routes/dashboard');

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

  app.use(
    cors({
      origin: cfg.corsOrigins.includes("*") ? true : cfg.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    })
  );

  app.use(morgan(cfg.env === "production" ? "combined" : "dev"));

  const whitelistedIPs = cfg.rateLimit.whitelistedIPs;

  const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
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
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const clientIP = resolveClientIp(req);
      return clientIP ? whitelistedIPs.includes(clientIP) : false;
    }
  });

  app.use("/api/v1/health", health);
  app.use("/api/v1/auth", generalLimiter, authRoutes);
  app.use("/api/v1/me", generalLimiter, meRoutes);
  app.use("/api/v1/user", generalLimiter, userRoutes);

  const adminRouter = express.Router();
  adminRouter.use(adminRoutes);
  adminRouter.use('/agents', adminAgentsRoutes);
  adminRouter.use('/phones', adminPhonesRoutes);
  adminRouter.use('/campaigns', adminCampaignsRoutes);
  adminRouter.use('/users', adminUsersRoutes);
  adminRouter.use('/', adminCallsRoutes);

  app.use("/api/v1/admin", adminLimiter, adminRouter);
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
    console.error('Error:', err);

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

  return app.listen(cfg.port, () => {
    console.log(`API listening on http://localhost:${cfg.port} (env=${cfg.env})`);
  });
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
