const { Schema, model } = require('mongoose');

const LeadSchema = new Schema({
  call_id: {
    type: Schema.Types.ObjectId,
    ref: 'Call',
    required: true
  },

  user_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  campaign_id: {
    type: Schema.Types.ObjectId,
    ref: 'Campaign'
  }, // Null for inbound leads

  // Extracted contact information
  contact: {
    name: { type: String },
    phone: { type: String },
    email: { type: String },
    company: { type: String },
    title: { type: String }
  },

  // Lead details
  intent: { type: String }, // What they want/need

  urgency: {
    type: String,
    enum: ['hot', 'warm', 'cold'],
    default: 'warm'
  },

  next_steps: { type: String },

  keywords: [{ type: String }], // Important keywords from conversation

  // Lead management
  status: {
    type: String,
    enum: ['new', 'contacted', 'converted', 'lost'],
    default: 'new',
    index: true
  },

  assigned_to: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }, // Team member assigned to this lead

  notes: [{
    text: { type: String },
    added_by: { type: Schema.Types.ObjectId, ref: 'User' },
    added_at: { type: Date, default: Date.now }
  }],

  follow_up_date: { type: Date },

  conversion_value: { type: Number }, // If converted, monetary value

  // AI extraction metadata
  extraction_confidence: {
    type: Number,
    min: 0,
    max: 1
  }, // 0-1 score

  extraction_method: {
    type: String,
    enum: ['openai', 'claude', 'manual']
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Indexes for efficient queries
LeadSchema.index({ call_id: 1 });
LeadSchema.index({ user_id: 1, status: 1 });
LeadSchema.index({ user_id: 1, createdAt: -1 });
LeadSchema.index({ campaign_id: 1 });
LeadSchema.index({ 'contact.phone': 1 });
LeadSchema.index({ urgency: 1 });
LeadSchema.index({ status: 1, urgency: 1 });

// Compound index for filtering
LeadSchema.index({ user_id: 1, status: 1, urgency: 1, createdAt: -1 });

module.exports = model('Lead', LeadSchema);
