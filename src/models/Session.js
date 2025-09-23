const { Schema, model } = require('mongoose');

const SessionSchema = new Schema({
  sessionId: { type: String, index: true },
  userPhone: String,
  agentId: String,
  startedAt: Date,
  endedAt: Date,
  meta: Schema.Types.Mixed,
}, { timestamps: true });

module.exports = model('Session', SessionSchema);
