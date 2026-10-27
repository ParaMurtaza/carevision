const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // login account of the doctor
  name: { type: String, required: true },
  specialty: { type: String, required: true, index: true },
  licenseNo: { type: String, required: true },
  rating: { type: Number, default: 4.5 },
  consultFee: { type: Number, required: true },
  avatar: String,
  availability: [String] // e.g. ["09:00 AM", "10:00 AM"]
}, { timestamps: true });

module.exports = mongoose.model('Doctor', doctorSchema);
