const router = require('express').Router();
const { query, validationResult } = require('express-validator');

const { requireAuth, requireRole } = require('../../middleware/auth');
const ctrl = require('../../controllers/admin/agents.controller');

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
  query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('Search must be a string up to 100 characters'),
  validate,
  ctrl.list
);

module.exports = router;
