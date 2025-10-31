const router = require('express').Router();
const { body, param, query, validationResult } = require('express-validator');

const { requireAuth, requireRole } = require('../../middleware/auth');
const ctrl = require('../../controllers/admin/users.controller');
const agentsCtrl = require('../../controllers/admin/agents.controller');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const roleValidator = body('role').optional().isIn(['admin', 'inbound', 'outbound']).withMessage('Role must be admin, inbound, or outbound');

router.use(requireAuth, requireRole('admin'));

router.get('/',
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('PageSize must be between 1 and 100'),
  query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('Search must be a string up to 100 characters'),
  query('role').optional().isIn(['admin', 'inbound', 'outbound']).withMessage('Role filter must be admin, inbound, or outbound'),
  query('status').optional().isIn(['active', 'suspended', 'pending_approval']).withMessage('Status filter must be active, suspended, or pending_approval'),
  validate,
  ctrl.list
);

router.post('/',
  body('email').isEmail().withMessage('Email must be valid'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body('name').optional().isString().trim().isLength({ max: 200 }).withMessage('Name must be a string up to 200 characters'),
  roleValidator,
  validate,
  ctrl.create
);

router.get('/:id',
  param('id').isMongoId().withMessage('Invalid user id'),
  validate,
  ctrl.getOne
);

router.patch('/:id',
  param('id').isMongoId().withMessage('Invalid user id'),
  body('name').optional().isString().trim().isLength({ max: 200 }).withMessage('Name must be a string up to 200 characters'),
  roleValidator,
  body('password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body().custom((value, { req }) => {
    if (typeof req.body.name === 'undefined'
      && typeof req.body.role === 'undefined'
      && typeof req.body.password === 'undefined') {
      throw new Error('At least one field (name, role, password) must be provided');
    }
    return true;
  }),
  validate,
  ctrl.update
);

router.post('/:id/agents',
  param('id').isMongoId().withMessage('Invalid user id'),
  body('agentId').isString().trim().isLength({ min: 1, max: 50 }).withMessage('AgentId must be a string between 1 and 50 characters'),
  validate,
  agentsCtrl.assignToUser
);

router.delete('/:id/agents/:agentId',
  param('id').isMongoId().withMessage('Invalid user id'),
  param('agentId').isString().trim().isLength({ min: 1, max: 50 }).withMessage('AgentId must be a string between 1 and 50 characters'),
  validate,
  agentsCtrl.unassignFromUser
);

router.get('/:id/agents',
  param('id').isMongoId().withMessage('Invalid user id'),
  validate,
  ctrl.getAssignedAgents
);

router.delete('/:id',
  param('id').isMongoId().withMessage('Invalid user id'),
  validate,
  ctrl.remove
);

// New endpoints for Phase 2
router.patch('/:id/status',
  param('id').isMongoId().withMessage('Invalid user id'),
  body('status').isIn(['active', 'suspended', 'pending_approval']).withMessage('Status must be active, suspended, or pending_approval'),
  body('reason').optional().isString().withMessage('Reason must be a string'),
  validate,
  ctrl.updateStatus
);

router.patch('/:id/subscription',
  param('id').isMongoId().withMessage('Invalid user id'),
  body('plan').optional().isIn(['basic', 'pro', 'enterprise']).withMessage('Plan must be basic, pro, or enterprise'),
  body('call_minutes_allocated').optional().isInt({ min: 0 }).withMessage('Call minutes must be a non-negative integer'),
  body('start_date').optional().isISO8601().withMessage('Start date must be a valid ISO date'),
  body('end_date').optional().isISO8601().withMessage('End date must be a valid ISO date'),
  body('notes').optional().isString().withMessage('Notes must be a string'),
  validate,
  ctrl.updateSubscription
);

router.get('/:id/usage',
  param('id').isMongoId().withMessage('Invalid user id'),
  validate,
  ctrl.getUsage
);

module.exports = router;
