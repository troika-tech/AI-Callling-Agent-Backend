const { Schema, model } = require('mongoose');

const PhoneSchema = new Schema({
  phoneId: { type: String, index: true }, // Millis ID
  number: String,
  tags: [String],
  agentId: String,
  meta: Schema.Types.Mixed,
}, { timestamps: true });

module.exports = model('Phone', PhoneSchema);
