const { Schema, model } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const CampaignSchema = new Schema({
  user_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  name: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    trim: true
  },

  // Campaign status workflow
  status: {
    type: String,
    enum: ['draft', 'pending_approval', 'approved', 'rejected', 'active', 'paused', 'completed'],
    default: 'draft',
    index: true
  },

  // Target numbers uploaded by user
  target_numbers: [{
    phone: { type: String, required: true },
    name: { type: String },
    call_status: { type: String }, // Status of call to this number
    call_recording_url: { type: String }, // URL to call recording from Millis
    call_duration: { type: Number }, // Duration in seconds
    call_started_at: { type: Date }, // When call started
    call_ended_at: { type: Date }, // When call ended
    metadata: { type: Schema.Types.Mixed } // Additional fields from CSV
  }],

  // Knowledge base files uploaded by user
  knowledge_base_files: [{
    filename: { type: String },
    url: { type: String }, // S3 URL or local path
    size: { type: Number }, // File size in bytes
    uploaded_at: { type: Date, default: Date.now }
  }],

  // Campaign schedule (optional)
  schedule: {
    start_date: { type: Date },
    end_date: { type: Date },
    timezone: { type: String, default: 'UTC' },
    call_frequency: {
      calls_per_hour: { type: Number, default: 10 },
      max_concurrent_calls: { type: Number, default: 3 }
    }
  },

  // Admin-assigned after approval
  assigned_agent_id: { type: String }, // Agent ID from Millis
  assigned_kb_id: { type: String }, // KB ID created on Millis
  assigned_phone_number: { type: String }, // Phone number to use for calling

  // Approval workflow
  approval: {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected']
    },
    reviewed_by_admin_id: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewed_at: { type: Date },
    rejection_reason: { type: String },
    admin_notes: { type: String }
  },

  // Campaign statistics
  stats: {
    total_numbers: { type: Number, default: 0 },
    calls_made: { type: Number, default: 0 },
    calls_answered: { type: Number, default: 0 },
    calls_no_answer: { type: Number, default: 0 },
    calls_busy: { type: Number, default: 0 },
    calls_failed: { type: Number, default: 0 },
    calls_remaining: { type: Number, default: 0 },
    total_duration_seconds: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    total_cost: { type: Number, default: 0 }
  },

  // Millis integration
  millis_campaign_id: { type: String }, // Campaign ID in Millis system

  // Timestamps
  launched_at: { type: Date },
  completed_at: { type: Date }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Indexes for efficient queries
CampaignSchema.index({ user_id: 1, status: 1 });
CampaignSchema.index({ status: 1, createdAt: -1 });
CampaignSchema.index({ 'approval.status': 1 });

// Pre-save hook to update total_numbers
CampaignSchema.pre('save', function(next) {
  if (this.isModified('target_numbers')) {
    this.stats.total_numbers = this.target_numbers.length;
    this.stats.calls_remaining = this.target_numbers.length - this.stats.calls_made;
  }
  next();
});

// Add pagination plugin
CampaignSchema.plugin(mongoosePaginate);

module.exports = model('Campaign', CampaignSchema);
