const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_IDS = {
  basic:   process.env.STRIPE_PRICE_BASIC,
  pro:     process.env.STRIPE_PRICE_PRO,
  premium: process.env.STRIPE_PRICE_PREMIUM
};

async function createCheckoutSession({ orderId, tier, userEmail, successUrl, cancelUrl }) {
  const priceId = PRICE_IDS[tier];
  if (!priceId) throw new Error(`Invalid tier: ${tier}`);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: userEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { orderId },
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl
  });

  return session;
}

module.exports = { stripe, createCheckoutSession };
