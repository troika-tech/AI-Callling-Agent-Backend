const mongoose = require('mongoose');
const cfg = require('./config');

async function connectMongo() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(cfg.mongoUrl, {
    autoIndex: true
  });
  console.log('Connected to MongoDB');
  return mongoose.connection;
}

module.exports = { connectMongo };
