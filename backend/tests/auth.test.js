/**
 * Auth API tests — POST /api/auth/register, POST /api/auth/login, GET /api/auth/me.
 */

const request = require('supertest');

// Mock supabase BEFORE loading app — routes use `supabase` (anon client)
jest.mock('../src/config/supabase', () => ({
  supabase: { from: jest.fn() },
  supabaseAdmin: { from: jest.fn() }
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
  compare: jest.fn()
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
  verify: jest.fn()
}));

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { supabase } = require('../src/config/supabase');

let app;
beforeAll(() => { app = require('../src/app'); });

// Helper: build a supabase chain mock returning the given result at `.single()`
function chainSingle(result) {
  return {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result)
  };
}

// ─── Register ─────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  const payload = { email: 'newuser@example.com', password: 'Password123!', name: 'New User' };

  test('201 — creates user and returns JWT + user (no password field)', async () => {
    const mockUser = { id: 'uid-1', email: payload.email, name: payload.name, tier: 'basic', created_at: new Date().toISOString() };

    // First from() → check existing (not found). Second from() → insert succeeds.
    supabase.from
      .mockReturnValueOnce(chainSingle({ data: null, error: { code: 'PGRST116' } }))  // no existing user
      .mockReturnValueOnce(chainSingle({ data: mockUser, error: null }));               // insert success

    const res = await request(app).post('/api/auth/register').send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).not.toHaveProperty('password');
    expect(res.body.user.email).toBe(payload.email);
  });

  test('400 — missing required fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('400 — password too short', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...payload, password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('409 — duplicate email returns conflict', async () => {
    supabase.from.mockReturnValueOnce(
      chainSingle({ data: { id: 'existing-uid' }, error: null })  // existing user found
    );

    const res = await request(app).post('/api/auth/register').send(payload);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_EXISTS');
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  const payload = { email: 'user@example.com', password: 'Password123!' };

  test('200 — valid credentials return JWT + user (no password field)', async () => {
    const mockUser = { id: 'uid-2', email: 'user@example.com', name: 'Test User', tier: 'basic', password: '$2b$10$hashedpassword', created_at: new Date().toISOString() };
    supabase.from.mockReturnValueOnce(chainSingle({ data: mockUser, error: null }));
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app).post('/api/auth/login').send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).not.toHaveProperty('password');
  });

  test('401 — wrong password', async () => {
    const mockUser = { id: 'uid-3', email: 'user@example.com', password: '$2b$10$hash' };
    supabase.from.mockReturnValueOnce(chainSingle({ data: mockUser, error: null }));
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app).post('/api/auth/login').send(payload);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  test('401 — non-existent email', async () => {
    supabase.from.mockReturnValueOnce(chainSingle({ data: null, error: { code: 'PGRST116' } }));

    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'Whatever1!' });
    expect(res.status).toBe(401);
  });

  test('400 — missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'x@x.com' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ─── GET /me ─────────────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  test('401 — no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  test('401 — malformed/invalid JWT', async () => {
    jwt.verify.mockImplementation(() => { throw new Error('invalid token'); });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer bad.token.here');

    expect(res.status).toBe(401);
  });

  test('200 — valid JWT returns user without password', async () => {
    // JWT payload uses `id` (matches what auth.js signs: { id, email })
    jwt.verify.mockReturnValue({ id: 'uid-4', email: 'user@example.com' });

    const mockUser = { id: 'uid-4', email: 'user@example.com', name: 'Test User', tier: 'basic', created_at: new Date().toISOString() };
    supabase.from.mockReturnValueOnce(chainSingle({ data: mockUser, error: null }));

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer valid.jwt.token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.id).toBe('uid-4');
    expect(res.body.user).not.toHaveProperty('password');
  });
});
