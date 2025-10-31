const { Schema, model } = require('mongoose');

const AdminAuditSchema = new Schema({
  actor: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  action: {
    type: String,
    required: true,
    enum: [
      // Phone management
      'set_agent', 'update_tags', 'import_phones',
      // Campaign management
      'approve_campaign', 'reject_campaign', 'pause_campaign', 'delete_campaign',
      // User management
      'create_user', 'suspend_user', 'activate_user', 'delete_user', 'update_subscription',
      // System
      'system_config_change'
    ],
    index: true
  },

  target: {
    type: String,
    required: true,
    index: true
  }, // User ID, phone number, campaign ID, etc.

  targetType: {
    type: String,
    required: true,
    enum: ['phone', 'campaign', 'user', 'system'],
    index: true
  },

  // Additional details about the action
  details: {
    type: Schema.Types.Mixed,
    default: {}
  }, // Action-specific details

  diff: {
    type: Schema.Types.Mixed,
    default: null
  }, // before/after values

  reason: {
    type: String,
    maxlength: 500
  },

  millisResponse: {
    type: Schema.Types.Mixed,
    default: null
  },

  ipAddress: {
    type: String,
    maxlength: 45 // IPv6 max length
  },

  userAgent: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true,
  indexes: [
    { actor: 1, createdAt: -1 },
    { action: 1, createdAt: -1 },
    { target: 1, targetType: 1 },
    { targetType: 1, createdAt: -1 }
  ]
});

// Helper method to create audit log
AdminAuditSchema.statics.log = async function(logData) {
  return await this.create(logData);
};

module.exports = model('AdminAudit', AdminAuditSchema);
