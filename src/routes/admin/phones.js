const router = require('express').Router();
const { body, query, param, validationResult } = require('express-validator');
const { requireAuth, requireRole } = require('../../middleware/auth');
const ctrl = require('../../controllers/admin/phones.controller');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

router.use(requireAuth, requireRole('admin'));

router.get('/',
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('PageSize must be between 1 and 100'),
  query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('Search must be a string with max 100 characters'),
  validate,
  ctrl.list
);

router.post('/import',
  body('phones').isArray({ min: 1 }).withMessage('Phones must be a non-empty array'),
  body('phones.*').isString().trim().isLength({ min: 1, max: 20 }).withMessage('Each phone must be a string between 1-20 characters'),
  validate,
  ctrl.import
);

router.post('/:phone/set_agent',
  param('phone').isString().trim().isLength({ min: 1, max: 20 }).withMessage('Phone must be a string between 1-20 characters'),
  body('agentId').isString().trim().isLength({ min: 1, max: 50 }).withMessage('AgentId must be a string between 1-50 characters'),
  validate,
  ctrl.setAgent
);

router.patch('/:phone/tags',
  param('phone').isString().trim().isLength({ min: 1, max: 20 }).withMessage('Phone must be a string between 1-20 characters'),
  body('tags').isArray().withMessage('Tags must be an array'),
  body('tags.*').isString().trim().isLength({ min: 1, max: 30 }).withMessage('Each tag must be a string between 1-30 characters'),
  validate,
  ctrl.updateTags
);

module.exports = router;
