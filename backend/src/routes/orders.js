const express = require('express');
const { supabase } = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const { getSignedUrls } = require('../integrations/storage');

// Attach fresh signed download URLs to a complete order
async function withSignedUrls(order) {
  if (order.status !== 'complete' || (!order.audio_mp3_url && !order.audio_wav_url)) {
    return order;
  }
  try {
    const [mp3Url, wavUrl] = await getSignedUrls(order.audio_mp3_url, order.audio_wav_url);
    return { ...order, audio_mp3_url: mp3Url, audio_wav_url: wavUrl };
  } catch {
    return order;
  }
}

const router = express.Router();

const VALID_TIERS = ['basic', 'pro', 'premium'];
const VALID_GENRES = ['pop', 'rock', 'hip-hop', 'jazz', 'classical', 'electronic', 'country', 'r&b', 'folk', 'metal', 'other'];
const VALID_MOODS = ['happy', 'sad', 'energetic', 'calm', 'romantic', 'angry', 'melancholic', 'uplifting', 'mysterious', 'other'];
const VALID_TYPES = ['song', 'instrumental'];

// All order routes require authentication
router.use(authMiddleware);

// POST /api/orders — create order + Stripe checkout session
router.post('/', async (req, res, next) => {
  try {
    const { tier, title, genre, mood, type } = req.body;

    if (!tier || !title || !genre || !mood || !type) {
      return res.status(400).json({ error: 'tier, title, genre, mood, and type are required', code: 'VALIDATION_ERROR' });
    }
    if (!VALID_TIERS.includes(tier)) {
      return res.status(400).json({ error: `tier must be one of: ${VALID_TIERS.join(', ')}`, code: 'VALIDATION_ERROR' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}`, code: 'VALIDATION_ERROR' });
    }
    if (title.trim().length < 1 || title.trim().length > 200) {
      return res.status(400).json({ error: 'title must be between 1 and 200 characters', code: 'VALIDATION_ERROR' });
    }

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        user_id: req.user.id,
        tier,
        title: title.trim(),
        genre,
        mood,
        type,
        status: 'pending'
      })
      .select()
      .single();

    if (error) return next(error);

    // Attempt to create Stripe checkout session
    let checkoutUrl = null;
    try {
      const { createCheckoutSession } = require('../integrations/stripe');
      const { data: user } = await supabase
        .from('users')
        .select('email')
        .eq('id', req.user.id)
        .single();

      checkoutUrl = await createCheckoutSession({
        orderId: order.id,
        tier,
        userEmail: user?.email,
        successUrl: `${process.env.FRONTEND_URL}/order/${order.id}?payment=success`,
        cancelUrl: `${process.env.FRONTEND_URL}/order/new?cancelled=true`
      });
    } catch (stripeErr) {
      console.warn('[Orders] Stripe checkout not available:', stripeErr.message);
    }

    res.status(201).json({ order, checkoutUrl });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders — list user's orders (newest first)
router.get('/', async (req, res, next) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) return next(error);

    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id — get single order
router.get('/:id', async (req, res, next) => {
  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found', code: 'NOT_FOUND' });
    }

    res.json({ order: await withSignedUrls(order) });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id/status — status polling endpoint
router.get('/:id/status', async (req, res, next) => {
  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('status, audio_mp3_url, audio_wav_url')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found', code: 'NOT_FOUND' });
    }

    res.json({
      status: order.status,
      audioMp3Url: order.audio_mp3_url,
      audioWavUrl: order.audio_wav_url
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/orders/:id/retry — retry a failed order
router.post('/:id/retry', async (req, res, next) => {
  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found', code: 'NOT_FOUND' });
    }

    if (order.status !== 'failed') {
      return res.status(400).json({ error: 'Only failed orders can be retried', code: 'INVALID_STATUS' });
    }

    const { generateMusic } = require('../integrations/tempolor');
    const jobId = await generateMusic(order);

    const { error: updateErr } = await supabase
      .from('orders')
      .update({ status: 'generating', tempolor_job_id: jobId, error_message: null })
      .eq('id', order.id);

    if (updateErr) return next(updateErr);

    res.json({ status: 'generating', jobId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
