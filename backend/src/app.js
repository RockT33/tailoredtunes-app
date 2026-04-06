const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// ── Security middleware ──────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));

// ── Webhook routes (MUST be before express.json) ────────────
// Each sub-route applies its own body parser (raw for Stripe, json for TemPolor)
app.use('/api/webhooks', require('./routes/webhooks'));

// ── Body parsing ─────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', code: 'RATE_LIMITED' }
});
app.use(generalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, try again later', code: 'RATE_LIMITED' }
});
app.use('/api/auth', authLimiter);

// ── Health check ─────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: require('../package.json').version });
});

// ── Routes ───────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/orders', require('./routes/orders'));

// ── 404 handler ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', code: 'NOT_FOUND' });
});

// ── Global error handler ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message, err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR'
  });
});

module.exports = app;
