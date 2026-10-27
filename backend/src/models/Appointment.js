const mongoose = require('mongoose');

const chatLineSchema = new mongoose.Schema({ sender: String, text: String }, { _id: false });

const appointmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
  date: { type: String, required: true },   // "2026-10-12"
  slot: { type: String, required: true },   // "10:00 AM"
  status: { type: String, enum: ['booked', 'completed', 'cancelled'], default: 'booked' },
  // AI-generated case brief created by the symptom checker
  symptomBrief: {
    symptoms: [String],
    severity: Number,
    duration: String,
    history: String,
    triageLevel: String,
    notes: String,
    chatLog: [chatLineSchema] // the patient's conversation with the AI, shown to the doctor
  },
  meetLink: String,
  diagnosis: String,
  prescription: [String],
  followUp: String // labs / follow-up advice written by the doctor
}, { timestamps: true });

// A doctor cannot be double-booked for the same date + slot
appointmentSchema.index({ doctorId: 1, date: 1, slot: 1 }, {
  unique: true,
  partialFilterExpression: { status: 'booked' }
});

module.exports = mongoose.model('Appointment', appointmentSchema);
