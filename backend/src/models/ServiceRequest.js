const mongoose = require('mongoose');

// One collection for every extra service: lab tests, scans, care plans, corporate leads, medicine orders.
const serviceRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['lab', 'scan', 'careplan', 'corporate', 'medicine'], required: true },
  itemId: String,
  title: { type: String, required: true },
  amount: { type: Number, default: 0 },
  preferredDate: String,
  contact: { name: String, phone: String, address: String, company: String, employees: Number },
  items: [{ name: String, qty: Number, price: Number }], // medicine orders
  notes: String,
  status: { type: String, enum: ['requested', 'confirmed', 'completed', 'cancelled'], default: 'requested' }
}, { timestamps: true });

module.exports = mongoose.model('ServiceRequest', serviceRequestSchema);
