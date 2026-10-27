const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, phone: u.phone, role: u.role });

exports.register = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
    if (/[<>]/.test(name)) return res.status(400).json({ message: 'Name cannot contain < or >' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const passwordHash = await bcrypt.hash(password, 12);
    // role is always "patient" here - users cannot make themselves doctors/admins
    const user = await User.create({ name, email, phone, passwordHash, role: 'patient' });
    res.status(201).json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) { next(err); }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    const ok = user && await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Incorrect email or password' });

    if (user.active === false) return res.status(403).json({ message: 'This account has been disabled. Contact the clinic.' });
    res.json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) { next(err); }
};

exports.me = (req, res) => res.json({ user: publicUser(req.user) });

// PATCH /api/auth/me  { name, phone }
exports.updateMe = async (req, res, next) => {
  try {
    const { name, phone } = req.body;
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: 'Name cannot be empty' });
      req.user.name = String(name).trim().slice(0, 80);
    }
    if (phone !== undefined) req.user.phone = String(phone).trim().slice(0, 20);
    await req.user.save();
    res.json({ user: publicUser(req.user) });
  } catch (err) { next(err); }
};
