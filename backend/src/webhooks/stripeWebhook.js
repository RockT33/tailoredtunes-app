const { stripe } = require('../integrations/stripe');
const { generateMusic } = require('../integrations/tempolor');
const { supabaseAdmin } = require('../config/supabase');

async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[Stripe webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata?.orderId;

    if (!orderId) {
      console.error('[Stripe webhook] Missing orderId in session metadata', session.id);
      return res.json({ received: true });
    }

    // Mark order as generating and record Stripe session
    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({ status: 'generating', stripe_session_id: session.id })
      .eq('id', orderId);

    if (updateErr) {
      console.error('[Stripe webhook] Failed to update order status:', updateErr.message);
      return res.status(500).json({ error: 'DB update failed' });
    }

    // Fetch full order to get music details
    const { data: order, error: fetchErr } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) {
      console.error('[Stripe webhook] Failed to fetch order:', fetchErr?.message);
      return res.status(500).json({ error: 'Order fetch failed' });
    }

    try {
      const jobId = await generateMusic(order);

      await supabaseAdmin
        .from('orders')
        .update({ tempolor_job_id: jobId })
        .eq('id', orderId);

      console.log(`[Stripe webhook] TemPolor job started: ${jobId} for order: ${orderId}`);
    } catch (genErr) {
      console.error('[Stripe webhook] TemPolor generation failed:', genErr.message);
      await supabaseAdmin
        .from('orders')
        .update({ status: 'failed', error_message: genErr.message })
        .eq('id', orderId);
    }
  }

  res.json({ received: true });
}

module.exports = { handleStripeWebhook };
