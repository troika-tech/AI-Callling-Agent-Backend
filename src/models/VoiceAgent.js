const { Schema, model } = require('mongoose');

const VoiceAgentSchema = new Schema({
  user_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  voice_label: {
    type: String,
    default: "You're a helpful assistant.",
    trim: true,
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
    index: true,
  },
  millis_agent_id: {
    type: String,
    index: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

module.exports = model('VoiceAgent', VoiceAgentSchema);
