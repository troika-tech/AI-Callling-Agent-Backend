const { Schema, model } = require('mongoose');

const CampaignApprovalSchema = new Schema({
  campaignId: { type: String, index: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['approved', 'rejected'], index: true },
  reason: String,
  millisResponse: Schema.Types.Mixed,
}, { timestamps: true });

module.exports = model('CampaignApproval', CampaignApprovalSchema);
