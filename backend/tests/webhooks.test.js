/**
 * Webhook handler tests — covers Stripe and TemPolor webhook handlers.
 * These routes ARE implemented so these tests should pass with mocks.
 */

const request = require('supertest');

// ── Stripe mock ───────────────────────────────────────────────────────────────
const mockConstructEvent = jest.fn();
jest.mock('../src/integrations/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: mockConstructEvent
    }
  },
  createCheckoutSession: jest.fn()
}));

// ── TemPolor mock ─────────────────────────────────────────────────────────────
const mockGenerateMusic = jest.fn();
jest.mock('../src/integrations/tempolor', () => ({
  generateMusic: mockGenerateMusic,
  withRetry: jest.fn((fn) => fn())
}));

// ── Storage mock ──────────────────────────────────────────────────────────────
const mockUploadAudio = jest.fn();
jest.mock('../src/integrations/storage', () => ({
  uploadAudioToStorage: mockUploadAudio
}));

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockEqUpdate = jest.fn().mockResolvedValue({ error: null });
const mockSingle = jest.fn();
const mockEqSelect = jest.fn().mockReturnValue({ single: mockSingle });
const mockSelect = jest.fn().mockReturnValue({ eq: mockEqSelect });
const mockUpdate = jest.fn().mockReturnValue({ eq: mockEqUpdate });
const mockFrom = jest.fn().mockReturnValue({ update: mockUpdate, select: mockSelect });

jest.mock('../src/config/supabase', () => ({
  supabase: {},
  supabaseAdmin: { from: mockFrom }
}));

let app;

beforeAll(() => {
  app = require('../src/app');
});

beforeEach(() => {
  jest.clearAllMocks();
  // Re-attach the mock implementations after clearAllMocks
  mockFrom.mockReturnValue({ update: mockUpdate, select: mockSelect });
  mockUpdate.mockReturnValue({ eq: mockEqUpdate });
  mockEqUpdate.mockResolvedValue({ error: null });
  mockSelect.mockReturnValue({ eq: mockEqSelect });
  mockEqSelect.mockReturnValue({ single: mockSingle });
});

// ─── Stripe Webhook ───────────────────────────────────────────────────────────

describe('POST /api/webhooks/stripe', () => {
  const rawBody = Buffer.from(JSON.stringify({ type: 'checkout.session.completed', data: {} }));

  test('400 — invalid Stripe signature', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });

    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'bad_signature')
      .send(rawBody);

    expect(res.status).toBe(400);
    expect(res.text).toMatch(/Webhook Error/);
  });

  test('200 — checkout.session.completed updates order to generating and starts TemPolor job', async () => {
    const orderId = 'order-uuid-stripe-test';
    const sessionId = 'cs_test_abc123';
    const mockOrder = {
      id: orderId,
      title: 'Test Song',
      genre: 'pop',
      mood: 'happy',
      type: 'song',
      tier: 'basic'
    };

    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          metadata: { orderId }
        }
      }
    });

    mockSingle.mockResolvedValue({ data: mockOrder, error: null });
    mockGenerateMusic.mockResolvedValue('tempolor-job-id-789');

    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'valid_sig')
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    // Verify order was updated to 'generating'
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'generating', stripe_session_id: sessionId })
    );

    // Verify TemPolor job was started
    expect(mockGenerateMusic).toHaveBeenCalledWith(expect.objectContaining({ id: orderId }));
  });

  test('200 — checkout.session.completed with missing orderId in metadata still returns received', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: { id: 'cs_test_nometadata', metadata: {} }
      }
    });

    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'valid_sig')
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('200 — unhandled event types are ignored gracefully', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.created',
      data: { object: {} }
    });

    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'valid_sig')
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('500 — DB update failure during checkout.session.completed returns 500', async () => {
    const orderId = 'order-uuid-db-fail';
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: { id: 'cs_fail', metadata: { orderId } }
      }
    });

    mockEqUpdate.mockResolvedValue({ error: { message: 'DB connection lost' } });

    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'valid_sig')
      .send(rawBody);

    expect(res.status).toBe(500);
  });
});

// ─── TemPolor Webhook ─────────────────────────────────────────────────────────

describe('POST /api/webhooks/tempolor', () => {
  test('400 — missing job_id', async () => {
    const res = await request(app)
      .post('/api/webhooks/tempolor')
      .send({ status: 'complete', mp3_url: 'https://example.com/track.mp3', wav_url: 'https://example.com/track.wav' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.code).toBe('MISSING_JOB_ID');
  });

  test('200 — complete status uploads audio and updates order to complete', async () => {
    const jobId = 'tempolor-job-123';
    const mp3SignedUrl = 'https://supabase.co/storage/v1/signed/audio/tempolor-job-123/track.mp3?token=abc';
    const wavSignedUrl = 'https://supabase.co/storage/v1/signed/audio/tempolor-job-123/track.wav?token=def';

    mockUploadAudio.mockResolvedValue([mp3SignedUrl, wavSignedUrl]);

    const res = await request(app)
      .post('/api/webhooks/tempolor')
      .send({
        job_id: jobId,
        status: 'complete',
        mp3_url: 'https://tempolor.com/output/job-123.mp3',
        wav_url: 'https://tempolor.com/output/job-123.wav'
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    expect(mockUploadAudio).toHaveBeenCalledWith(
      jobId,
      'https://tempolor.com/output/job-123.mp3',
      'https://tempolor.com/output/job-123.wav'
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'complete',
        audio_mp3_url: mp3SignedUrl,
        audio_wav_url: wavSignedUrl
      })
    );
  });

  test('400 — complete status with missing audio URLs', async () => {
    const res = await request(app)
      .post('/api/webhooks/tempolor')
      .send({ job_id: 'job-no-audio', status: 'complete' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_URLS');
  });

  test('200 — failed status updates order to failed with error message', async () => {
    const jobId = 'tempolor-job-failed';
    const errorMsg = 'Generation model unavailable';

    const res = await request(app)
      .post('/api/webhooks/tempolor')
      .send({ job_id: jobId, status: 'failed', error: errorMsg });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error_message: errorMsg
      })
    );
    expect(mockEqUpdate).toHaveBeenCalledWith('tempolor_job_id', jobId);
  });

  test('200 — failed status without error message uses default message', async () => {
    const res = await request(app)
      .post('/api/webhooks/tempolor')
      .send({ job_id: 'job-fail-no-msg', status: 'failed' });

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error_message: 'TemPolor generation failed'
      })
    );
  });

  test('500 — DB failure during complete status returns 500', async () => {
    mockUploadAudio.mockResolvedValue(['https://example.com/mp3', 'https://example.com/wav']);
    mockEqUpdate.mockResolvedValue({ error: { message: 'DB error' } });

    const res = await request(app)
      .post('/api/webhooks/tempolor')
      .send({
        job_id: 'job-db-fail',
        status: 'complete',
        mp3_url: 'https://tempolor.com/output/mp3',
        wav_url: 'https://tempolor.com/output/wav'
      });

    expect(res.status).toBe(500);
  });

  test('500 — audio upload failure marks order as failed', async () => {
    mockUploadAudio.mockRejectedValue(new Error('S3 bucket unreachable'));

    const res = await request(app)
      .post('/api/webhooks/tempolor')
      .send({
        job_id: 'job-upload-fail',
        status: 'complete',
        mp3_url: 'https://tempolor.com/mp3',
        wav_url: 'https://tempolor.com/wav'
      });

    expect(res.status).toBe(500);
    // Should have tried to mark the order as failed
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' })
    );
  });
});
