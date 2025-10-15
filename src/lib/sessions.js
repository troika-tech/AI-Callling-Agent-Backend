const crypto = require('crypto');
const AuthSession = require('../models/AuthSession');
const { signAccess } = require('./jwt');
const cfg = require('../config');

const SESSION_COOKIE_NAME = cfg.auth?.sessionCookieName || 'session';
const REFRESH_COOKIE_NAME = cfg.auth?.refreshCookieName || 'refresh_token';
const SESSION_TTL_MS = cfg.auth?.sessionTtlMs || (12 * 60 * 60 * 1000);
const REFRESH_TTL_MS = cfg.auth?.refreshTtlMs || (7 * 24 * 60 * 60 * 1000);

const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

function safeHash(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeUserAgent(ua) {
  return ua ? ua.trim().toLowerCase() : '';
}

function normalizeIp(ip) {
  if (!ip) return '';
  const value = ip.includes('::') ? ip.split(':').slice(0, 4).join(':') : ip;
  const parts = value.split('.');
  if (parts.length === 4) {
    return parts.slice(0, 3).join('.');
  }
  return value;
}

function buildAccessToken(user, sessionId) {
  return signAccess({
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
    sid: sessionId
  }, { expiresIn: SESSION_TTL_SECONDS });
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

async function createSession(user, context = {}) {
  const sessionId = crypto.randomUUID();
  const refreshToken = generateRefreshToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REFRESH_TTL_MS);

  const session = await AuthSession.create({
    user: user._id,
    sessionId,
    refreshTokenHash: safeHash(refreshToken),
    userAgentHash: safeHash(normalizeUserAgent(context.userAgent)),
    ipHash: safeHash(normalizeIp(context.ipAddress)),
    expiresAt,
    lastUsedAt: now
  });

  const accessToken = buildAccessToken(user, sessionId);

  return { session, refreshToken, accessToken };
}

async function findSessionByRefreshToken(refreshToken, context = {}) {
  if (!refreshToken) return null;
  const refreshHash = safeHash(refreshToken);
  if (!refreshHash) return null;

  const session = await AuthSession.findOne({
    refreshTokenHash: refreshHash,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() }
  });
  if (!session) return null;

  const userAgentHash = safeHash(normalizeUserAgent(context.userAgent));
  if (session.userAgentHash && userAgentHash && session.userAgentHash !== userAgentHash) {
    return null;
  }

  const ipHash = safeHash(normalizeIp(context.ipAddress));
  if (session.ipHash && ipHash && session.ipHash !== ipHash) {
    return null;
  }

  return session;
}

async function rotateSession(session, user, context = {}) {
  const refreshToken = generateRefreshToken();
  const now = new Date();

  session.refreshTokenHash = safeHash(refreshToken);
  session.expiresAt = new Date(now.getTime() + REFRESH_TTL_MS);
  session.lastUsedAt = now;

  const uaHash = safeHash(normalizeUserAgent(context.userAgent));
  if (uaHash) session.userAgentHash = uaHash;

  const ipHash = safeHash(normalizeIp(context.ipAddress));
  if (ipHash) session.ipHash = ipHash;

  await session.save();

  const accessToken = buildAccessToken(user, session.sessionId);
  return { refreshToken, accessToken };
}

async function revokeSession(session) {
  if (!session) return;
  const now = new Date();
  if (typeof session === 'string') {
    await AuthSession.updateOne({ sessionId: session }, { $set: { revokedAt: now } });
    return;
  }
  session.revokedAt = now;
  await session.save();
}

function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: cfg.auth?.sameSite || 'None',
    secure: cfg.auth?.secureCookies !== undefined ? cfg.auth.secureCookies : cfg.env === 'production',
    domain: cfg.auth?.cookieDomain,
    path: '/',
    maxAge: SESSION_TTL_MS
  };
}

function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: cfg.auth?.sameSite || 'None',
    secure: cfg.auth?.secureCookies !== undefined ? cfg.auth.secureCookies : cfg.env === 'production',
    domain: cfg.auth?.cookieDomain,
    path: '/',
    maxAge: REFRESH_TTL_MS
  };
}

module.exports = {
  SESSION_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  SESSION_TTL_MS,
  REFRESH_TTL_MS,
  createSession,
  findSessionByRefreshToken,
  rotateSession,
  revokeSession,
  getSessionCookieOptions,
  getRefreshCookieOptions,
  normalizeIp,
  normalizeUserAgent,
  hashValue: safeHash
};