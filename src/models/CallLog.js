const { Schema, model } = require('mongoose');

const CallLogSchema = new Schema({
  callId: { type: String, index: true },
  from: String,
  to: String,
  startedAt: Date,
  endedAt: Date,
  durationSec: Number,
  status: String,
  meta: Schema.Types.Mixed,
}, { timestamps: true });

module.exports = model('CallLog', CallLogSchema);
