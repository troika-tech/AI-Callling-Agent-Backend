const { Schema, model } = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const CallerPhoneSchema = new Schema({
  user_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  campaign_id: {
    type: Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true,
    index: true
  },

  caller_number: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  caller_status: {
    type: String,
    required: true,
    enum: ['live', 'active', 'pending', 'inactive', 'error'],
    default: 'pending'
  },

  objectid: {
    type: String,
    required: true,
    trim: true
  },

  // Additional metadata from Exotel
  metadata: {
    name: { type: String },
    tags: [{ type: String }],
    integration_status: { type: String },
    provider: { type: String, default: 'exotel' },
    api_key: { type: String },
    api_token: { type: String },
    account_sid: { type: String },
    subdomain: { type: String },
    app_id: { type: String },
    region: { type: String },
    country: { type: String }
  },

  // Knowledge base documents
  knowledge_base: {
    documents: [{
      document_id: { type: String }, // Reference to AgentDocuments _id
      filename: { type: String, required: true },
      original_name: { type: String, required: true },
      file_type: { 
        type: String, 
        enum: ['csv', 'json', 'txt', 'pdf'],
        required: true 
      },
      file_size: { type: Number, required: true },
      file_path: { type: String, required: true },
      upload_date: { type: Date, default: Date.now },
      processed: { type: Boolean, default: false },
      content_summary: { type: String },
      extracted_data: { type: Schema.Types.Mixed } // Store parsed content
    }],
    total_documents: { type: Number, default: 0 },
    last_updated: { type: Date, default: Date.now }
  },

  // Status tracking
  is_active: {
    type: Boolean,
    default: true
  },

  // Timestamps
  assigned_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Indexes for efficient queries
CallerPhoneSchema.index({ user_id: 1, campaign_id: 1 });
CallerPhoneSchema.index({ caller_number: 1 });
CallerPhoneSchema.index({ caller_status: 1 });
CallerPhoneSchema.index({ is_active: 1 });
CallerPhoneSchema.index({ 'knowledge_base.total_documents': 1 });
CallerPhoneSchema.index({ 'knowledge_base.last_updated': 1 });

// Compound index for unique caller per campaign
CallerPhoneSchema.index({ campaign_id: 1, is_active: 1 }, { unique: true, partialFilterExpression: { is_active: true } });

// Pre-save hook to update knowledge base counts
CallerPhoneSchema.pre('save', function(next) {
  if (this.isModified('knowledge_base.documents')) {
    this.knowledge_base.total_documents = this.knowledge_base.documents.length;
    this.knowledge_base.last_updated = new Date();
  }
  next();
});

// Add pagination plugin
CallerPhoneSchema.plugin(mongoosePaginate);

module.exports = model('CallerPhone', CallerPhoneSchema);
