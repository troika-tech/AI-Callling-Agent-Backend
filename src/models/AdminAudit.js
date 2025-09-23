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
    enum: ['set_agent', 'update_tags', 'approve_campaign', 'reject_campaign'],
    index: true 
  },
  target: { 
    type: String, 
    required: true,
    index: true 
  }, // phone number, campaign ID, etc.
  targetType: { 
    type: String, 
    required: true,
    enum: ['phone', 'campaign'],
    index: true 
  },
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
    { target: 1, targetType: 1 }
  ]
});

module.exports = model('AdminAudit', AdminAuditSchema);
