const router = require('express').Router();
const { body, param, query, validationResult } = require('express-validator');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const approvalCtrl = require('../../controllers/admin/campaignApproval.controller');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

router.use(requireAuth, requireAdmin);

// Get all campaigns (with filters)
router.get('/',
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isString().withMessage('Status must be a string'),
  query('user_id').optional().isMongoId().withMessage('User ID must be a valid MongoDB ID'),
  validate,
  approvalCtrl.getAllCampaigns
);

// Get pending campaigns awaiting approval
router.get('/pending',
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  validate,
  approvalCtrl.getPendingCampaigns
);

// Get campaign details for review
router.get('/:id',
  param('id').isMongoId().withMessage('Invalid campaign ID'),
  validate,
  approvalCtrl.getCampaignForReview
);

// Approve campaign
router.post('/:id/approve',
  param('id').isMongoId().withMessage('Invalid campaign ID'),
  body('assigned_agent_id').isString().trim().notEmpty().withMessage('Assigned agent ID is required'),
  body('assigned_kb_id').isString().trim().notEmpty().withMessage('Assigned KB ID is required'),
  body('assigned_phone_number').isString().trim().notEmpty().withMessage('Assigned phone number is required'),
  body('admin_notes').optional().isString().trim().isLength({ max: 500 }).withMessage('Admin notes must be max 500 characters'),
  validate,
  approvalCtrl.approveCampaign
);

// Reject campaign
router.post('/:id/reject',
  param('id').isMongoId().withMessage('Invalid campaign ID'),
  body('rejection_reason').isString().trim().notEmpty().withMessage('Rejection reason is required'),
  validate,
  approvalCtrl.rejectCampaign
);

module.exports = router;
