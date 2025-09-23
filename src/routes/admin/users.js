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

const roleValidator = body('role').optional().isIn(['admin', 'user']).withMessage('Role must be admin or user');

router.use(requireAuth, requireRole('admin'));

router.get('/',
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('PageSize must be between 1 and 100'),
  query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('Search must be a string up to 100 characters'),
  query('role').optional().isIn(['admin', 'user']).withMessage('Role filter must be admin or user'),
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

module.exports = router;
