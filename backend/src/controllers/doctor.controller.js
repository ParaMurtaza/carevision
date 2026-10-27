const Doctor = require('../models/Doctor');

// GET /api/doctors?specialty=Cardiology
exports.list = async (req, res, next) => {
  try {
    const filter = req.query.specialty ? { specialty: req.query.specialty } : {};
    const doctors = await Doctor.find(filter).sort({ rating: -1 });
    res.json({ doctors });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    res.json({ doctor });
  } catch (err) { next(err); }
};

// GET /api/doctors/me  (logged-in doctor) - own public profile
exports.me = async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ user: req.user._id });
    if (!doctor) return res.status(404).json({ message: 'No doctor profile linked to this account' });
    res.json({ doctor });
  } catch (err) { next(err); }
};
