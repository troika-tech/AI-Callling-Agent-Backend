const { Schema, model } = require('mongoose');

const agentDocumentsSchema = new Schema({
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
  filename: {
    type: String,
    required: true
  },
  original_name: {
    type: String,
    required: true
  },
  file_type: {
    type: String,
    required: true,
    enum: ['csv', 'json', 'txt', 'pdf']
  },
  file_size: {
    type: Number,
    required: true
  },
  file_path: {
    type: String,
    required: true
  },
  upload_date: {
    type: Date,
    default: Date.now
  },
  processed: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['uploaded', 'processing', 'processed', 'failed'],
    default: 'uploaded'
  },
  millis_document_id: {
    type: String,
    index: true
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Create compound index for efficient queries
agentDocumentsSchema.index({ user_id: 1, campaign_id: 1 });
agentDocumentsSchema.index({ upload_date: -1 });
agentDocumentsSchema.index({ file_type: 1 });

module.exports = model('AgentDocuments', agentDocumentsSchema);
