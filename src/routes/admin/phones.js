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
  query('pageSize').optional().isInt({ min: 1, max: 1000 }).withMessage('PageSize must be between 1 and 1000'),
  query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('Search must be a string with max 100 characters'),
  validate,
  ctrl.list
);

router.post('/import',
  body('phones').optional().isArray().withMessage('Phones must be an array'),
  body('phones.*').optional().isString().trim().isLength({ min: 1, max: 20 }).withMessage('Each phone must be a string between 1-20 characters'),
  // For Exotel import
  body('phone').optional().isString().trim().isLength({ min: 1, max: 20 }).withMessage('Phone must be a string between 1-20 characters'),
  body('country').optional().isString().trim().isLength({ min: 1, max: 20 }).withMessage('Country must be a string'),
  body('region').optional().isString().trim().isLength({ min: 1, max: 20 }).withMessage('Region must be a string'),
  body('provider').optional().isString().trim().isLength({ min: 1, max: 20 }).withMessage('Provider must be a string'),
  body('api_key').optional().isString().trim().withMessage('API key must be a string'),
  body('api_token').optional().isString().trim().withMessage('API token must be a string'),
  body('sid').optional().isString().trim().withMessage('SID must be a string'),
  body('subdomain').optional().isString().trim().withMessage('Subdomain must be a string'),
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
