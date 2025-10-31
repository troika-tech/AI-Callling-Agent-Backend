const express = require('express');
const { query, validationResult } = require('express-validator');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const AdminAudit = require('../../models/AdminAudit');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

router.use(requireAuth, requireAdmin);

/**
 * Get admin activity logs
 * GET /api/v1/admin/logs
 */
router.get('/',
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('action').optional().isString().withMessage('Action must be a string'),
  query('target_type').optional().isString().withMessage('Target type must be a string'),
  query('actor_id').optional().isMongoId().withMessage('Actor ID must be a valid MongoDB ID'),
  validate,
  async (req, res, next) => {
    try {
      const {
        page = 1,
        limit = 50,
        action,
        target_type,
        actor_id
      } = req.query;

      const pageNumber = parseInt(page, 10);
      const limitNumber = Math.min(parseInt(limit, 10), 100);

      const filter = {};
      if (action) filter.action = action;
      if (target_type) filter.targetType = target_type;
      if (actor_id) filter.actor = actor_id;

      const [logs, total] = await Promise.all([
        AdminAudit.find(filter)
          .populate('actor', 'email name role')
          .sort({ createdAt: -1 })
          .skip((pageNumber - 1) * limitNumber)
          .limit(limitNumber)
          .lean(),
        AdminAudit.countDocuments(filter)
      ]);

      res.json({
        logs: logs.map(log => ({
          id: log._id.toString(),
          admin: log.actor ? {
            id: log.actor._id.toString(),
            email: log.actor.email,
            name: log.actor.name
          } : null,
          action: log.action,
          target: log.target,
          target_type: log.targetType,
          details: log.details,
          reason: log.reason,
          timestamp: log.createdAt,
          ip_address: log.ipAddress
        })),
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          pages: Math.ceil(total / limitNumber)
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
