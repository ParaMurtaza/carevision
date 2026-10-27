// Admin (clinic administrator) controller. Every route here is protected by restrictTo('admin').
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const ServiceRequest = require('../models/ServiceRequest');
const AgentResult = require('../models/AgentResult');

const SLOTS = ['09:00 AM', '10:00 AM', '11:00 AM', '02:00 PM', '03:00 PM', '04:00 PM'];
const countBy = (arr, key) => arr.reduce((m, x) => ((m[x[key]] = (m[x[key]] || 0) + 1), m), {});

// GET /api/admin/stats  - totals are computed in JS (simple and easy to explain at college scale)
exports.stats = async (req, res, next) => {
  try {
    const [users, doctors, appts, requests, results] = await Promise.all([
      User.find({}, 'role active'), Doctor.find({}, 'consultFee'),
      Appointment.find({}, 'status doctorId createdAt'), ServiceRequest.find({}, 'status amount type'),
      AgentResult.find({}, 'agent')
    ]);
    const fee = Object.fromEntries(doctors.map(d => [String(d._id), d.consultFee]));
    const consultRevenue = appts.filter(a => a.status !== 'cancelled').reduce((s, a) => s + (fee[String(a.doctorId)] || 0), 0);
    const serviceRevenue = requests.filter(r => r.status !== 'cancelled').reduce((s, r) => s + (r.amount || 0), 0);

    // last 7 days of new appointments
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      days.push({ date: d.toISOString().slice(0, 10), count: appts.filter(a => a.createdAt >= d && a.createdAt < next).length });
    }
    res.json({
      patients: users.filter(u => u.role === 'patient').length,
      doctors: doctors.length,
      appointments: countBy(appts, 'status'),
      requests: countBy(requests, 'status'),
      requestsByType: countBy(requests, 'type'),
      aiUsage: countBy(results, 'agent'),
      revenue: { consultations: consultRevenue, services: serviceRevenue, total: consultRevenue + serviceRevenue },
      last7Days: days
    });
  } catch (err) { next(err); }
};

exports.users = async (req, res, next) => {
  try { res.json({ users: await User.find({}).sort({ createdAt: -1 }).limit(300) }); }
  catch (err) { next(err); }
};

exports.toggleUser = async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user._id)) return res.status(400).json({ message: 'You cannot disable your own account' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ message: 'Admin accounts cannot be disabled here' });
    user.active = !user.active;
    await user.save();
    res.json({ user });
  } catch (err) { next(err); }
};

// POST /api/admin/doctors  - creates the doctor's login AND the public profile
exports.addDoctor = async (req, res, next) => {
  try {
    const { name, email, password, specialty, licenseNo, consultFee } = req.body;
    if (!name || !email || !password || !specialty || !licenseNo || !consultFee) return res.status(400).json({ message: 'All fields are required' });
    if (/[<>]/.test(`${name}${specialty}${licenseNo}`)) return res.status(400).json({ message: 'Names cannot contain < or >' });
    if (String(password).length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    const fee = Number(consultFee);
    if (!(fee > 0 && fee <= 20000)) return res.status(400).json({ message: 'Enter a fee between 1 and 20000' });

    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role: 'doctor' });
    const avatar = name.replace(/^Dr\.?\s*/i, '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const doctor = await Doctor.create({ user: user._id, name, specialty, licenseNo, consultFee: fee, avatar, rating: 4.5, availability: SLOTS });
    res.status(201).json({ doctor });
  } catch (err) { next(err); }
};

exports.updateDoctor = async (req, res, next) => {
  try {
    const patch = {};
    if (req.body.consultFee !== undefined) {
      const fee = Number(req.body.consultFee);
      if (!(fee > 0 && fee <= 20000)) return res.status(400).json({ message: 'Enter a fee between 1 and 20000' });
      patch.consultFee = fee;
    }
    if (req.body.specialty) patch.specialty = String(req.body.specialty);
    if (Array.isArray(req.body.availability)) patch.availability = req.body.availability.map(String).slice(0, 12);
    const doctor = await Doctor.findByIdAndUpdate(req.params.id, patch, { new: true });
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    res.json({ doctor });
  } catch (err) { next(err); }
};

exports.deleteDoctor = async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    if (await Appointment.exists({ doctorId: doctor._id, status: 'booked' })) {
      return res.status(400).json({ message: 'This doctor still has booked appointments. Complete or cancel them first.' });
    }
    await User.deleteOne({ _id: doctor.user });
    await doctor.deleteOne();
    res.json({ deleted: true });
  } catch (err) { next(err); }
};

exports.appointments = async (req, res, next) => {
  try {
    const list = await Appointment.find({}).populate('userId', 'name email').populate('doctorId', 'name specialty consultFee')
      .sort({ createdAt: -1 }).limit(300);
    res.json({ appointments: list });
  } catch (err) { next(err); }
};

exports.requests = async (req, res, next) => {
  try {
    res.json({ requests: await ServiceRequest.find({}).populate('userId', 'name email phone').sort({ createdAt: -1 }).limit(300) });
  } catch (err) { next(err); }
};

exports.updateRequest = async (req, res, next) => {
  try {
    if (!['requested', 'confirmed', 'completed', 'cancelled'].includes(req.body.status)) return res.status(400).json({ message: 'Invalid status' });
    const r = await ServiceRequest.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!r) return res.status(404).json({ message: 'Request not found' });
    res.json({ request: r });
  } catch (err) { next(err); }
};
