// Standardize response shapes for list endpoints
const standardizeListResponse = (data, page = 1, pageSize = 50) => {
  return {
    items: data.items || [],
    page: parseInt(page) || 1,
    pageSize: parseInt(pageSize) || 50,
    total: data.total || (data.items ? data.items.length : 0)
  };
};

// Create audit log entry
const createAuditLog = async (AdminAudit, {
  actor,
  action,
  target,
  targetType,
  diff = null,
  reason = null,
  millisResponse = null,
  ipAddress = null,
  userAgent = null
}) => {
  try {
    await AdminAudit.create({
      actor,
      action,
      target,
      targetType,
      diff,
      reason,
      millisResponse,
      ipAddress,
      userAgent
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw - audit logging should not break the main flow
  }
};

// Extract client info from request
const getClientInfo = (req) => ({
  ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0],
  userAgent: req.headers['user-agent']
});

module.exports = {
  standardizeListResponse,
  createAuditLog,
  getClientInfo
};
