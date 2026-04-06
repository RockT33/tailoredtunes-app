/**
 * Orders API tests — POST /api/orders, GET /api/orders, GET /api/orders/:id
 */

const request = require('supertest');

// Routes use `supabase` (anon client)
jest.mock('../src/config/supabase', () => ({
  supabase: { from: jest.fn() },
  supabaseAdmin: { from: jest.fn() }
}));

jest.mock('../src/integrations/stripe', () => ({
  createCheckoutSession: jest.fn(),
  stripe: {}
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
  verify: jest.fn()
}));

const jwt = require('jsonwebtoken');
const { supabase } = require('../src/config/supabase');
const { createCheckoutSession } = require('../src/integrations/stripe');

let app;
beforeAll(() => { app = require('../src/app'); });

// JWT payload mirrors what auth.js signs: { id, email }
const mockUserId = 'user-uuid-123';
beforeEach(() => {
  jwt.verify.mockReturnValue({ id: mockUserId, email: 'user@example.com' });
});

const authHeader = 'Bearer valid.jwt.token';

// Helper: build a supabase chain that resolves at `.single()`
function chainSingle(result) {
  return {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue(result),
    single: jest.fn().mockResolvedValue(result)
  };
}

// ─── Create Order ─────────────────────────────────────────────────────────────

describe('POST /api/orders', () => {
  const validOrder = { tier: 'basic', title: 'My Summer Anthem', genre: 'pop', mood: 'happy', type: 'song' };

  test('201 — creates order and returns order + checkout session', async () => {
    const mockOrder = { id: 'order-uuid', ...validOrder, user_id: mockUserId, status: 'pending', created_at: new Date().toISOString() };
    const mockSession = { id: 'cs_test_123', url: 'https://checkout.stripe.com/pay/cs_test_123' };

    // from('orders') → insert → select → single
    // from('users')  → select → eq → single (to get user email for Stripe)
    supabase.from
      .mockReturnValueOnce(chainSingle({ data: mockOrder, error: null }))   // insert order
      .mockReturnValueOnce(chainSingle({ data: { email: 'user@example.com' }, error: null })); // user email

    createCheckoutSession.mockResolvedValue(mockSession);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', authHeader)
      .send(validOrder);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('order');
    expect(res.body).toHaveProperty('checkoutUrl');
    expect(res.body.order.status).toBe('pending');
    expect(res.body.order.user_id).toBe(mockUserId);
    // checkoutUrl is the full Stripe session object
    expect(res.body.checkoutUrl).toHaveProperty('url');
    expect(res.body.checkoutUrl.url).toContain('checkout.stripe.com');
  });

  test('201 — checkoutUrl is null when Stripe is unavailable', async () => {
    const mockOrder = { id: 'order-uuid-2', ...validOrder, user_id: mockUserId, status: 'pending' };
    supabase.from.mockReturnValueOnce(chainSingle({ data: mockOrder, error: null }));
    createCheckoutSession.mockRejectedValue(new Error('Stripe unavailable'));

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', authHeader)
      .send(validOrder);

    // Order is still created even if Stripe fails (graceful degradation)
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('order');
    expect(res.body.checkoutUrl).toBeNull();
  });

  test('400 — missing required fields', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', authHeader)
      .send({ tier: 'basic' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('400 — invalid tier', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', authHeader)
      .send({ ...validOrder, tier: 'platinum' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('400 — invalid type', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', authHeader)
      .send({ ...validOrder, type: 'video' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('401 — missing JWT', async () => {
    const res = await request(app).post('/api/orders').send(validOrder);
    expect(res.status).toBe(401);
  });
});

// ─── List Orders ──────────────────────────────────────────────────────────────

describe('GET /api/orders', () => {
  test('200 — returns array of authenticated user orders', async () => {
    const mockOrders = [
      { id: 'order-1', user_id: mockUserId, title: 'Song 1', status: 'complete', tier: 'basic' },
      { id: 'order-2', user_id: mockUserId, title: 'Song 2', status: 'pending', tier: 'pro' }
    ];
    supabase.from.mockReturnValueOnce(chainSingle({ data: mockOrders, error: null }));

    const res = await request(app).get('/api/orders').set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('orders');
    expect(Array.isArray(res.body.orders)).toBe(true);
    expect(res.body.orders).toHaveLength(2);
  });

  test('200 — returns empty array when user has no orders', async () => {
    supabase.from.mockReturnValueOnce(chainSingle({ data: [], error: null }));

    const res = await request(app).get('/api/orders').set('Authorization', authHeader);
    expect(res.status).toBe(200);
    expect(res.body.orders).toEqual([]);
  });

  test('401 — missing JWT', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
  });
});

// ─── Get Single Order ─────────────────────────────────────────────────────────

describe('GET /api/orders/:id', () => {
  test('200 — returns own order', async () => {
    const orderId = 'order-uuid-abc';
    const mockOrder = { id: orderId, user_id: mockUserId, title: 'My Song', status: 'generating', tier: 'pro' };
    supabase.from.mockReturnValueOnce(chainSingle({ data: mockOrder, error: null }));

    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('order');
    expect(res.body.order.id).toBe(orderId);
  });

  test('404 — order not found (enforced by user_id filter in query)', async () => {
    // orders.js queries: .eq('id', ...).eq('user_id', req.user.id) — another user's order returns empty
    supabase.from.mockReturnValueOnce(chainSingle({ data: null, error: { code: 'PGRST116' } }));

    const res = await request(app)
      .get('/api/orders/order-xyz')
      .set('Authorization', authHeader);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('401 — missing JWT', async () => {
    const res = await request(app).get('/api/orders/some-order-id');
    expect(res.status).toBe(401);
  });
});

// ─── Order Status ─────────────────────────────────────────────────────────────

describe('GET /api/orders/:id/status', () => {
  test('200 — returns status, audioMp3Url, audioWavUrl', async () => {
    const orderId = 'order-status-test';
    const mockOrder = { status: 'generating', audio_mp3_url: null, audio_wav_url: null };
    supabase.from.mockReturnValueOnce(chainSingle({ data: mockOrder, error: null }));

    const res = await request(app)
      .get(`/api/orders/${orderId}/status`)
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('audioMp3Url');
    expect(res.body).toHaveProperty('audioWavUrl');
    expect(['pending', 'payment_complete', 'generating', 'complete', 'failed']).toContain(res.body.status);
  });

  test('200 — complete order includes signed audio URLs', async () => {
    const mp3 = 'https://storage.supabase.co/signed/mp3';
    const wav = 'https://storage.supabase.co/signed/wav';
    supabase.from.mockReturnValueOnce(chainSingle({
      data: { status: 'complete', audio_mp3_url: mp3, audio_wav_url: wav },
      error: null
    }));

    const res = await request(app)
      .get('/api/orders/done-order/status')
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('complete');
    expect(res.body.audioMp3Url).toBe(mp3);
    expect(res.body.audioWavUrl).toBe(wav);
  });

  test('404 — order not found', async () => {
    supabase.from.mockReturnValueOnce(chainSingle({ data: null, error: { code: 'PGRST116' } }));

    const res = await request(app)
      .get('/api/orders/nope/status')
      .set('Authorization', authHeader);

    expect(res.status).toBe(404);
  });
});
