const { Schema, model } = require('mongoose');

const UserSchema = new Schema({
  email: { type: String, unique: true, index: true, required: true, lowercase: true, trim: true },
  name: { type: String, trim: true },
  phone: { type: String, trim: true },
  passwordHash: { type: String, required: true },

  // Updated role types for the 3-dashboard system
  role: {
    type: String,
    enum: ['admin', 'inbound', 'outbound'],
    required: true,
    index: true
  },

  // Account status
  status: {
    type: String,
    enum: ['active', 'suspended', 'pending_approval'],
    default: 'active',
    index: true
  },

  // Subscription details (call minutes based billing)
  subscription: {
    plan: {
      type: String,
      enum: ['basic', 'pro', 'enterprise'],
      default: 'basic'
    },
    call_minutes_allocated: { type: Number, default: 0 },
    call_minutes_used: { type: Number, default: 0 },
    start_date: { type: Date },
    end_date: { type: Date },
    notes: { type: String } // Admin notes about subscription
  },

  // Millis configuration
  millis_config: {
    api_key: { type: String }, // If using separate API keys per user
    assigned_phone_numbers: [{ type: String }], // Phone numbers assigned to user
    assigned_agents: [{ type: String }], // Agent IDs from Millis
    assigned_knowledge_bases: [{ type: String }] // KB IDs from Millis
  },

  // Track who created this user (for admin audit)
  created_by_admin_id: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Indexes for efficient queries
UserSchema.index({ role: 1, status: 1 });
UserSchema.index({ 'subscription.plan': 1 });

module.exports = model('User', UserSchema);
