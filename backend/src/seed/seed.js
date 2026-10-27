// Run once: npm run seed   -> creates demo doctors + their login accounts
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Doctor = require('../models/Doctor');

const SLOTS = ['09:00 AM', '10:00 AM', '11:00 AM', '02:00 PM', '03:00 PM', '04:00 PM'];

const doctors = [
  { name: 'Dr. Alan Turing',       email: 'alan@carevision.test',   specialty: 'General Medicine', fee: 500,  rating: 4.9, avatar: 'AT' },
  { name: 'Dr. Grace Hopper',      email: 'grace@carevision.test',  specialty: 'General Medicine', fee: 600,  rating: 4.8, avatar: 'GH' },
  { name: 'Dr. Rosalind Franklin', email: 'rosalind@carevision.test', specialty: 'Dermatology',    fee: 700,  rating: 4.7, avatar: 'RF' },
  { name: 'Dr. Christian Barnard', email: 'christian@carevision.test', specialty: 'Cardiology',    fee: 1200, rating: 4.9, avatar: 'CB' },
  { name: 'Dr. Jonas Salk',        email: 'jonas@carevision.test',  specialty: 'Pediatrics',       fee: 400,  rating: 4.8, avatar: 'JS' }
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await Doctor.deleteMany({});
  await User.deleteMany({ role: 'doctor' });

  const passwordHash = await bcrypt.hash('Doctor@123', 12);
  for (const [i, d] of doctors.entries()) {
    const user = await User.create({ name: d.name, email: d.email, passwordHash, role: 'doctor' });
    await Doctor.create({
      user: user._id, name: d.name, specialty: d.specialty, licenseNo: `KMC-${10000 + i}`,
      rating: d.rating, consultFee: d.fee, avatar: d.avatar, availability: SLOTS
    });
  }
  // Admin + demo patient are created only if missing, so re-seeding never deletes real patients.
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@carevision.test';
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin@123';
  // older versions seeded "owner@carevision.test": upgrade that account instead of creating a second admin
  const legacy = await User.findOne({ email: 'owner@carevision.test', role: 'admin' });
  if (legacy && adminEmail !== legacy.email && !(await User.findOne({ email: adminEmail }))) {
    legacy.email = adminEmail; legacy.name = 'Clinic Admin';
    legacy.passwordHash = await bcrypt.hash(adminPass, 12);
    await legacy.save();
  }
  if (!(await User.findOne({ email: adminEmail }))) {
    await User.create({ name: 'Clinic Admin', email: adminEmail, passwordHash: await bcrypt.hash(adminPass, 12), role: 'admin' });
  }
  if (!(await User.findOne({ email: 'patient@carevision.test' }))) {
    await User.create({ name: 'Demo Patient', email: 'patient@carevision.test', phone: '9876543210', passwordHash: await bcrypt.hash('Patient@123', 12), role: 'patient' });
  }
  console.log(`Seeded ${doctors.length} doctors (password Doctor@123).`);
  console.log(`Admin login: ${adminEmail} / ${process.env.ADMIN_PASSWORD ? '(from ADMIN_PASSWORD)' : 'Admin@123'}   Demo patient: patient@carevision.test / Patient@123`);
  await mongoose.disconnect();
})();
