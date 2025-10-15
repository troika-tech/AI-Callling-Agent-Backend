module.exports = function requireGetMethod(req, res, next) {
  if (req.method !== 'GET') {
    return res.status(403).json({ error: 'Managed by Admins' });
  }
  next();
};