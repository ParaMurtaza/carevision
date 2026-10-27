const ServiceRequest = require('../models/ServiceRequest');
const catalog = require('../services/catalog');

const bad = (res, message) => res.status(400).json({ message });
const today = () => new Date().toISOString().slice(0, 10);

// GET /api/services/catalog  (public)
exports.catalog = (req, res) => res.json({ catalog: catalog.CATALOG });

// POST /api/services/requests  (logged-in patient)
exports.create = async (req, res, next) => {
  try {
    const { type, itemId, preferredDate, contact = {}, notes = '', items = [] } = req.body;
    if (!catalog.TYPES.includes(type) && type !== 'medicine') return bad(res, 'Unknown service type');
    const c = {
      name: String(contact.name || req.user.name).slice(0, 80),
      phone: String(contact.phone || '').replace(/\D/g, '').slice(-10),
      address: String(contact.address || '').slice(0, 250),
      company: String(contact.company || '').slice(0, 100),
      employees: Math.max(0, parseInt(contact.employees, 10) || 0)
    };
    const doc = { userId: req.user._id, type, contact: c, notes: String(notes).slice(0, 500) };

    if (type === 'medicine') {
      // medicine prices come from the client catalog in this demo - values are range-checked
      const clean = (Array.isArray(items) ? items : []).slice(0, 30).map(i => ({
        name: String(i.name || '').slice(0, 100),
        qty: Math.min(Math.max(parseInt(i.qty, 10) || 1, 1), 20),
        price: Math.min(Math.max(Number(i.price) || 0, 0), 50000)
      })).filter(i => i.name);
      if (!clean.length) return bad(res, 'Your cart is empty');
      if (c.phone.length < 10) return bad(res, 'Enter a valid 10-digit phone number');
      if (!c.address) return bad(res, 'Delivery address is required');
      doc.items = clean;
      doc.title = `Medicine order (${clean.length} item${clean.length > 1 ? 's' : ''})`;
      doc.amount = clean.reduce((sum, i) => sum + i.price * i.qty, 0);
    } else {
      const item = catalog.find(type, itemId);
      if (!item) return bad(res, 'Service not found');
      doc.itemId = item.id; doc.title = item.title; doc.amount = item.price || 0;

      if (type === 'lab' || type === 'scan') {
        if (!preferredDate || preferredDate < today()) return bad(res, 'Choose a date from today onwards');
        if (c.phone.length < 10) return bad(res, 'Enter a valid 10-digit phone number');
        if (type === 'lab' && !c.address) return bad(res, 'Address is required for home sample collection');
        doc.preferredDate = preferredDate;
      }
      if (type === 'careplan' && c.phone.length < 10) return bad(res, 'Enter a valid 10-digit phone number');
      if (type === 'corporate' && (!c.company || !c.employees)) return bad(res, 'Company name and number of employees are required');
    }
    res.status(201).json({ request: await ServiceRequest.create(doc) });
  } catch (err) { next(err); }
};

exports.mine = async (req, res, next) => {
  try { res.json({ requests: await ServiceRequest.find({ userId: req.user._id }).sort({ createdAt: -1 }) }); }
  catch (err) { next(err); }
};

exports.cancel = async (req, res, next) => {
  try {
    const r = await ServiceRequest.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id, status: 'requested' }, { status: 'cancelled' }, { new: true });
    if (!r) return res.status(404).json({ message: 'Only pending requests can be cancelled' });
    res.json({ request: r });
  } catch (err) { next(err); }
};
