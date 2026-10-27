const mongoose = require('mongoose');

module.exports = async function connectDB() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI missing. Create backend/.env from .env.example');
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
};
