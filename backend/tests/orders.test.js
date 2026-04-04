/**
 * Orders API tests — defines the contract for POST /api/orders,
 * GET /api/orders, and GET /api/orders/:id.
 *
 * These tests will FAIL until the Backend Engineer implements src/routes/orders.js
 * and uncomments it in src/app.js.
 */

const request = require('supertest');

jest.mock('../src/config/supabase', () => ({
  supabase: {},
  supabaseAdmin: {}
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
const { createCheckoutSession } = require('../src/integrations/stripe');

let app;

beforeAll(() => {
  app = require('../src/app');
});

// Helper — simulate an authenticated request
const authHeader = 'Bearer valid.jwt.token';
const mockUserId = 'user-uuid-123';

beforeEach(() => {
  jwt.verify.mockReturnValue({ sub: mockUserId, email: 'user@example.com' });
});

// ─── Create Order ─────────────────────────────────────────────────────────────

describe('POST /api/orders', () => {
  const validOrder = {
    tier: 'basic',
    title: 'My Summer Anthem',
    genre: 'pop',
    mood: 'happy',
    type: 'song'
  };

  test('201 — creates order and returns checkoutUrl', async () => {
    const { supabaseAdmin } = require('../src/config/supabase');
    const mockOrder = { id: 'order-uuid', ...validOrder, user_id: mockUserId, status: 'pending' };

    supabaseAdmin.from = jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockOrder, error: null })
        })
      })
    });

    createCheckoutSession.mockResolvedValue({
      id: 'cs_test_session123',
      url: 'https://checkout.stripe.com/pay/cs_test_session123'
    });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', authHeader)
      .send(validOrder);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('order');
    expect(res.body).toHaveProperty('checkoutUrl');
    expect(res.body.order.status).toBe('pending');
    expect(res.body.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);
  });

  test('400 — missing required fields', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', authHeader)
      .send({ tier: 'basic' }); // missing title, genre, mood, type

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('400 — invalid tier', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', authHeader)
      .send({ ...validOrder, tier: 'platinum' });

    expect(res.status).toBe(400);
  });

  test('401 — missing JWT', async () => {
    const res = await request(app).post('/api/orders').send(validOrder);
    expect(res.status).toBe(401);
  });
});

// ─── List Orders ──────────────────────────────────────────────────────────────

describe('GET /api/orders', () => {
  test('200 — returns array of authenticated user orders', async () => {
    const { supabaseAdmin } = require('../src/config/supabase');
    const mockOrders = [
      { id: 'order-1', user_id: mockUserId, title: 'Song 1', status: 'complete', tier: 'basic' },
      { id: 'order-2', user_id: mockUserId, title: 'Song 2', status: 'pending', tier: 'pro' }
    ];

    supabaseAdmin.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: mockOrders, error: null })
        })
      })
    });

    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('orders');
    expect(Array.isArray(res.body.orders)).toBe(true);
    expect(res.body.orders).toHaveLength(2);
    // Verify all orders belong to the authenticated user
    res.body.orders.forEach(order => {
      expect(order.user_id).toBe(mockUserId);
    });
  });

  test('200 — returns empty array when user has no orders', async () => {
    const { supabaseAdmin } = require('../src/config/supabase');
    supabaseAdmin.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: [], error: null })
        })
      })
    });

    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', authHeader);

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
    const { supabaseAdmin } = require('../src/config/supabase');
    const orderId = 'order-uuid-abc';
    const mockOrder = { id: orderId, user_id: mockUserId, title: 'My Song', status: 'generating', tier: 'pro' };

    supabaseAdmin.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockOrder, error: null })
        })
      })
    });

    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('order');
    expect(res.body.order.id).toBe(orderId);
  });

  test("404 — cannot access another user's order", async () => {
    const { supabaseAdmin } = require('../src/config/supabase');
    const otherUserOrder = { id: 'order-xyz', user_id: 'other-user-uuid', title: 'Their Song' };

    supabaseAdmin.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: otherUserOrder, error: null })
        })
      })
    });

    const res = await request(app)
      .get('/api/orders/order-xyz')
      .set('Authorization', authHeader);

    expect(res.status).toBe(404);
  });

  test('404 — non-existent order', async () => {
    const { supabaseAdmin } = require('../src/config/supabase');
    supabaseAdmin.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        })
      })
    });

    const res = await request(app)
      .get('/api/orders/does-not-exist')
      .set('Authorization', authHeader);

    expect(res.status).toBe(404);
  });

  test('401 — missing JWT', async () => {
    const res = await request(app).get('/api/orders/some-order-id');
    expect(res.status).toBe(401);
  });
});

// ─── Order Status ─────────────────────────────────────────────────────────────

describe('GET /api/orders/:id/status', () => {
  test('200 — returns status field for polling', async () => {
    const { supabaseAdmin } = require('../src/config/supabase');
    const orderId = 'order-status-test';
    const mockOrder = {
      id: orderId,
      user_id: mockUserId,
      status: 'generating',
      tempolor_job_id: 'job-abc'
    };

    supabaseAdmin.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockOrder, error: null })
        })
      })
    });

    const res = await request(app)
      .get(`/api/orders/${orderId}/status`)
      .set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(['pending', 'payment_complete', 'generating', 'complete', 'failed']).toContain(res.body.status);
  });
});
