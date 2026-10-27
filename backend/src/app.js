// Builds the Express app (kept separate from server.js so it is easy to test).
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security + utility middleware
app.use(helmet({ contentSecurityPolicy: false })); // CSP off: frontend uses inline handlers + Google Fonts
const origins = (process.env.CLIENT_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

// API routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/doctors', require('./routes/doctor.routes'));
app.use('/api/appointments', require('./routes/appointment.routes'));
app.use('/api/reports', require('./routes/report.routes'));
app.use('/api/ai', require('./routes/ai.routes'));
app.use('/api/agents', require('./routes/agent.routes'));
app.use('/api/services', require('./routes/service.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Serve the frontend from the same server (one deployment, no CORS trouble)
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

app.use('/api', (req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(errorHandler);

module.exports = app;
