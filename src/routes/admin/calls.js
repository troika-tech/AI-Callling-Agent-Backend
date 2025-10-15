const router = require('express').Router();
const { query, validationResult } = require('express-validator');
const { requireAuth, requireRole } = require('../../middleware/auth');
const ctrl = require('../../controllers/admin/calls.controller');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

router.use(requireAuth, requireRole('admin'));

router.get('/call_logs',
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('PageSize must be between 1 and 100'),
  query('from').optional().isISO8601().withMessage('From must be a valid ISO 8601 date'),
  query('to').optional().isISO8601().withMessage('To must be a valid ISO 8601 date'),
  query('status').optional().isString().trim().isLength({ max: 20 }).withMessage('Status must be a string with max 20 characters'),
  query('agentId').optional().isString().trim().isLength({ max: 50 }).withMessage('AgentId must be a string with max 50 characters'),
  query('phone').optional().isString().trim().isLength({ max: 20 }).withMessage('Phone must be a string with max 20 characters'),
  validate,
  ctrl.callLogs
);


module.exports = router;
