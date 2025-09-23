const router = require('express').Router();
const { body, param, validationResult } = require('express-validator');
const { requireAuth, requireRole } = require('../../middleware/auth');
const ctrl = require('../../controllers/admin/campaigns.controller');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

router.use(requireAuth, requireRole('admin'));

router.post('/:id/approve',
  param('id').isString().trim().isLength({ min: 1, max: 50 }).withMessage('Campaign ID must be a string between 1-50 characters'),
  body('approve').isBoolean().withMessage('Approve must be a boolean'),
  body('reason').optional().isString().trim().isLength({ max: 500 }).withMessage('Reason must be a string with max 500 characters'),
  validate,
  ctrl.approve
);

module.exports = router;
