const { Schema, model } = require('mongoose');

const UserSchema = new Schema({
  email: { type: String, unique: true, index: true, required: true, lowercase: true, trim: true },
  name: { type: String, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['owner', 'admin', 'user'], default: 'user', index: true }
}, { timestamps: true });

module.exports = model('User', UserSchema);
