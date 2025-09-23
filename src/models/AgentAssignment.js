const { Schema, model } = require('mongoose');

const AgentAssignmentSchema = new Schema({
  agentId: { type: String, required: true, unique: true, trim: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }
}, { timestamps: true });

module.exports = model('AgentAssignment', AgentAssignmentSchema);
