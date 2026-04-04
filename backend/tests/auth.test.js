/**
 * Auth API tests — defines the contract for POST /api/auth/register,
 * POST /api/auth/login, and GET /api/auth/me.
 *
 * These tests will FAIL until the Backend Engineer implements the routes in
 * src/routes/auth.js and uncomments them in src/app.js.
 */

const request = require('supertest');

// Mock Supabase before loading app
jest.mock('../src/config/supabase', () => ({
  supabase: {},
  supabaseAdmin: {}
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
  compare: jest.fn()
}));

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
  verify: jest.fn()
}));

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// We dynamically require the app so mocks take effect first
let app;

beforeAll(() => {
  app = require('../src/app');
});

// ─── Register ─────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  const validPayload = {
    email: 'newuser@example.com',
    password: 'Password123!',
    name: 'New User'
  };

  test('201 — creates user and returns JWT + user (no password field)', async () => {
    // Stub supabase to simulate successful insert
    const { supabaseAdmin } = require('../src/config/supabase');
    const mockUser = { id: 'user-uuid', email: validPayload.email, name: validPayload.name, tier: 'basic', created_at: new Date().toISOString() };
    supabaseAdmin.from = jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockUser, error: null })
        })
      }),
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        })
      })
    });

    const res = await request(app).post('/api/auth/register').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).not.toHaveProperty('password');
    expect(res.body.user.email).toBe(validPayload.email);
  });

  test('400 — missing required fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('409 — duplicate email returns conflict', async () => {
    const { supabaseAdmin } = require('../src/config/supabase');
    const existingUser = { id: 'existing-uuid', email: validPayload.email };
    supabaseAdmin.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: existingUser, error: null })
        })
      })
    });

    const res = await request(app).post('/api/auth/register').send(validPayload);
    expect([409, 400]).toContain(res.status);
    expect(res.body).toHaveProperty('error');
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  test('200 — valid credentials return JWT + user (no password field)', async () => {
    const { supabaseAdmin } = require('../src/config/supabase');
    const mockUser = {
      id: 'user-uuid',
      email: 'user@example.com',
      password: '$2b$10$hashedpassword',
      name: 'Test User',
      tier: 'basic'
    };
    supabaseAdmin.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockUser, error: null })
        })
      })
    });
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).not.toHaveProperty('password');
  });

  test('401 — wrong password', async () => {
    const { supabaseAdmin } = require('../src/config/supabase');
    const mockUser = { id: 'user-uuid', email: 'user@example.com', password: '$2b$10$hash' };
    supabaseAdmin.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockUser, error: null })
        })
      })
    });
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'WrongPass!' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('401 — non-existent email', async () => {
    const { supabaseAdmin } = require('../src/config/supabase');
    supabaseAdmin.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        })
      })
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Whatever!' });

    expect(res.status).toBe(401);
  });

  test('400 — missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
  });
});

// ─── GET /me ─────────────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  test('401 — no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('401 — invalid JWT', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('invalid token'); });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer bad.token.here');

    expect(res.status).toBe(401);
  });

  test('200 — valid JWT returns user without password', async () => {
    const userId = 'user-uuid';
    jwt.verify.mockReturnValue({ sub: userId, email: 'user@example.com' });

    const { supabaseAdmin } = require('../src/config/supabase');
    const mockUser = { id: userId, email: 'user@example.com', name: 'Test User', tier: 'basic' };
    supabaseAdmin.from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockUser, error: null })
        })
      })
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer valid.jwt.token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).not.toHaveProperty('password');
  });
});
