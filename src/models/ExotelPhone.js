const { Schema, model } = require('mongoose');

const ExotelPhoneSchema = new Schema({
  user_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Exotel configuration
  provider: {
    type: String,
    enum: ['exotel', 'twilio', 'vonage', 'plivo', 'telnyx'],
    default: 'exotel',
    required: true
  },
  
  // Phone number details
  phone_number: {
    type: String,
    required: true,
    trim: true
  },
  
  // Exotel API credentials
  api_key: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  
  api_token: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  
  account_sid: {
    type: String,
    trim: true
  },
  
  subdomain: {
    type: String,
    trim: true
  },
  
  app_id: {
    type: String,
    trim: true
  },
  
  // Additional configuration
  region: {
    type: String,
    default: 'us-west',
    trim: true
  },
  
  country: {
    type: String,
    default: 'United States (+1)',
    trim: true
  },
  
  // Status and metadata
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending', 'error', 'live'],
    default: 'pending',
    index: true
  },
  
  tags: [{
    type: String,
    trim: true
  }],
  
  // Integration status
  millis_phone_id: {
    type: String,
    trim: true
  },
  
  integration_status: {
    type: String,
    enum: ['pending', 'success', 'failed'],
    default: 'pending'
  },

  // Agent assignment
  assigned_agent_id: {
    type: Schema.Types.ObjectId,
    ref: 'VoiceAgent',
    default: null
  },
  
  millis_agent_id: {
    type: String,
    trim: true
  },
  
  integration_error: {
    type: String,
    trim: true
  },
  
  // Usage tracking
  last_used: {
    type: Date
  },
  
  call_count: {
    type: Number,
    default: 0
  },
  
  // Additional metadata
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for better performance
ExotelPhoneSchema.index({ user_id: 1, status: 1 });
ExotelPhoneSchema.index({ phone_number: 1 });
ExotelPhoneSchema.index({ provider: 1 });

module.exports = model('ExotelPhone', ExotelPhoneSchema);
