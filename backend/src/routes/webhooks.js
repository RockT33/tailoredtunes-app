const express = require('express');
const router = express.Router();
const { handleStripeWebhook } = require('../webhooks/stripeWebhook');
const { handleTempolorWebhook } = require('../webhooks/tempolorWebhook');

// Stripe requires the raw buffer for signature verification
router.post('/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);

// TemPolor sends JSON
router.post('/tempolor', express.json(), handleTempolorWebhook);

module.exports = router;
