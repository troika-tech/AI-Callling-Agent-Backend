function resolveClientIp(req) {
  return req.ip
    || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.connection?.remoteAddress
    || req.socket?.remoteAddress
    || null;
}

module.exports = { resolveClientIp };