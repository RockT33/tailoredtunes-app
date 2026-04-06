/**
 * Stripe integration unit tests — covers createCheckoutSession.
 */

// Mock the Stripe constructor before requiring the module
const mockSessionsCreate = jest.fn();
const mockStripeInstance = {
  checkout: { sessions: { create: mockSessionsCreate } },
  webhooks: { constructEvent: jest.fn() }
};

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => mockStripeInstance);
});

const { createCheckoutSession } = require('../src/integrations/stripe');

describe('createCheckoutSession', () => {
  beforeEach(() => {
    mockSessionsCreate.mockReset();
  });

  const baseParams = {
    orderId: 'order-uuid-test',
    tier: 'basic',
    userEmail: 'user@example.com',
    successUrl: 'http://localhost:5173/order/order-uuid-test',
    cancelUrl: 'http://localhost:5173/order/new'
  };

  test('creates a Stripe checkout session for basic tier', async () => {
    const mockSession = {
      id: 'cs_test_basic123',
      url: 'https://checkout.stripe.com/pay/cs_test_basic123'
    };
    mockSessionsCreate.mockResolvedValue(mockSession);

    const url = await createCheckoutSession(baseParams);

    expect(url).toBe(mockSession.url);
    expect(mockSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'payment',
      customer_email: 'user@example.com',
      line_items: [{ price: process.env.STRIPE_PRICE_BASIC, quantity: 1 }],
      metadata: { orderId: 'order-uuid-test' }
    }));
  });

  test('creates a session for pro tier', async () => {
    mockSessionsCreate.mockResolvedValue({ id: 'cs_pro', url: 'https://checkout.stripe.com/pay/cs_pro' });

    await createCheckoutSession({ ...baseParams, tier: 'pro' });

    expect(mockSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: process.env.STRIPE_PRICE_PRO, quantity: 1 }]
    }));
  });

  test('creates a session for premium tier', async () => {
    mockSessionsCreate.mockResolvedValue({ id: 'cs_premium', url: 'https://checkout.stripe.com/pay/cs_premium' });

    await createCheckoutSession({ ...baseParams, tier: 'premium' });

    expect(mockSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: process.env.STRIPE_PRICE_PREMIUM, quantity: 1 }]
    }));
  });

  test('appends session_id to success_url', async () => {
    mockSessionsCreate.mockResolvedValue({ id: 'cs_url_test', url: 'https://checkout.stripe.com' });

    await createCheckoutSession(baseParams);

    const callArgs = mockSessionsCreate.mock.calls[0][0];
    expect(callArgs.success_url).toContain('{CHECKOUT_SESSION_ID}');
    expect(callArgs.success_url).toContain(baseParams.successUrl);
  });

  test('throws for invalid tier', async () => {
    await expect(
      createCheckoutSession({ ...baseParams, tier: 'ultimate' })
    ).rejects.toThrow('Invalid tier: ultimate');
  });

  test('propagates Stripe API errors', async () => {
    mockSessionsCreate.mockRejectedValue(new Error('Your card was declined.'));

    await expect(createCheckoutSession(baseParams)).rejects.toThrow('Your card was declined.');
  });
});
