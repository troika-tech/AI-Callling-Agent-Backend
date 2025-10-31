const { Schema, model } = require('mongoose');

const CallSchema = new Schema({
  user_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Call type: inbound or outbound
  type: {
    type: String,
    enum: ['inbound', 'outbound'],
    required: true,
    index: true
  },

  // Campaign reference (only for outbound calls)
  campaign_id: {
    type: Schema.Types.ObjectId,
    ref: 'Campaign',
    index: true
  },

  // Call details
  phone_from: {
    type: String,
    required: true,
    index: true
  },

  phone_to: {
    type: String,
    required: true,
    index: true
  },

  direction: {
    type: String,
    enum: ['incoming', 'outgoing']
  },

  status: {
    type: String,
    enum: ['answered', 'no-answer', 'busy', 'failed', 'voicemail'],
    required: true
  },

  duration_seconds: {
    type: Number,
    default: 0
  },

  cost: {
    type: Number,
    default: 0
  }, // Cost in credits/minutes

  // Transcript and analysis
  transcript: {
    full_text: { type: String },
    language: { type: String, default: 'en' },
    segments: [{
      speaker: {
        type: String,
        enum: ['agent', 'customer']
      },
      text: { type: String },
      timestamp: { type: Number } // Seconds from start
    }]
  },

  // Sentiment analysis
  sentiment: {
    type: String,
    enum: ['positive', 'neutral', 'negative']
  },

  sentiment_score: {
    type: Number,
    min: -1,
    max: 1
  }, // -1 to 1 scale

  // Lead extraction
  lead_extracted: {
    type: Boolean,
    default: false
  },

  lead_id: {
    type: Schema.Types.ObjectId,
    ref: 'Lead'
  },

  disposition: {
    type: String,
    enum: ['converted', 'follow_up', 'not_interested', 'callback', 'voicemail', null]
  },

  // Millis metadata
  millis_call_id: {
    type: String
  },

  agent_id: { type: String },

  recording_url: { type: String },

  // Error tracking
  error_message: { type: String },
  error_code: { type: String },

  // Call timing
  call_started_at: { type: Date },
  call_ended_at: { type: Date }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Indexes for efficient queries
CallSchema.index({ user_id: 1, type: 1 });
CallSchema.index({ user_id: 1, createdAt: -1 });
CallSchema.index({ campaign_id: 1, createdAt: -1 });
CallSchema.index({ status: 1 });
CallSchema.index({ lead_extracted: 1 });
CallSchema.index({ millis_call_id: 1 }, { unique: true, sparse: true });

// Compound index for filtering
CallSchema.index({ user_id: 1, type: 1, status: 1, createdAt: -1 });

module.exports = model('Call', CallSchema);
