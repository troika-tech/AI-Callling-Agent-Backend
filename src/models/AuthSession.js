const { Schema, model } = require('mongoose');

const AuthSessionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sessionId: { type: String, required: true, unique: true, index: true },
  refreshTokenHash: { type: String, required: true },
  userAgentHash: { type: String },
  ipHash: { type: String },
  expiresAt: { type: Date, required: true },
  lastUsedAt: { type: Date, default: Date.now },
  revokedAt: { type: Date }
}, { timestamps: true });

AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('AuthSession', AuthSessionSchema);