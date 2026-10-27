const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verifies "Authorization: Bearer <token>" and attaches req.user
exports.protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;
    if (!token) return res.status(401).json({ message: 'Please log in first' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ message: 'User no longer exists' });

    if (user.active === false) return res.status(403).json({ message: 'This account has been disabled. Contact the clinic.' });

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Role guard: restrictTo('doctor', 'admin')
exports.restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission for this action' });
  }
  next();
};
