/**
 * TemPolor integration unit tests — covers generateMusic and withRetry.
 */

const axios = require('axios');
jest.mock('axios');

// Set up axios.create mock before requiring the module
const mockPost = jest.fn();
axios.create.mockReturnValue({ post: mockPost });

const { generateMusic, withRetry } = require('../src/integrations/tempolor');

describe('withRetry', () => {
  test('returns result on first attempt if successful', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await withRetry(fn, 3, 0);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on failure and eventually succeeds', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, 3, 0);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('throws after exhausting all retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Persistent failure'));
    await expect(withRetry(fn, 3, 0)).rejects.toThrow('Persistent failure');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('does not retry if maxRetries is 1', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Fail'));
    await expect(withRetry(fn, 1, 0)).rejects.toThrow('Fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('generateMusic', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  test('calls /generate with correct payload for song type', async () => {
    mockPost.mockResolvedValue({ data: { job_id: 'job-song-123' } });

    const jobId = await generateMusic({
      title: 'Test Song',
      genre: 'pop',
      mood: 'happy',
      type: 'song',
      tier: 'basic'
    });

    expect(jobId).toBe('job-song-123');
    expect(mockPost).toHaveBeenCalledWith('/generate', expect.objectContaining({
      model: process.env.TEMPOLOR_SONG_MODEL,
      title: 'Test Song',
      genre: 'pop',
      mood: 'happy',
      output_formats: ['mp3', 'wav'],
      quality: 'standard'
    }));
  });

  test('calls /generate with correct payload for instrumental type', async () => {
    mockPost.mockResolvedValue({ data: { job_id: 'job-instrumental-456' } });

    const jobId = await generateMusic({
      title: 'Background Music',
      genre: 'ambient',
      mood: 'calm',
      type: 'instrumental',
      tier: 'pro'
    });

    expect(jobId).toBe('job-instrumental-456');
    expect(mockPost).toHaveBeenCalledWith('/generate', expect.objectContaining({
      model: process.env.TEMPOLOR_INSTRUMENTAL_MODEL,
      quality: 'medium'
    }));
  });

  test('maps premium tier to high quality', async () => {
    mockPost.mockResolvedValue({ data: { job_id: 'job-premium-789' } });

    await generateMusic({ title: 'Premium Song', genre: 'jazz', mood: 'smooth', type: 'song', tier: 'premium' });

    expect(mockPost).toHaveBeenCalledWith('/generate', expect.objectContaining({
      quality: 'high'
    }));
  });

  test('returns job_id from TemPolor response', async () => {
    const expectedJobId = 'tempolor-job-xyz-999';
    mockPost.mockResolvedValue({ data: { job_id: expectedJobId } });

    const jobId = await generateMusic({ title: 'T', genre: 'rock', mood: 'angry', type: 'song', tier: 'basic' });
    expect(jobId).toBe(expectedJobId);
  });

  test('propagates error after retries are exhausted', async () => {
    mockPost.mockRejectedValue({ response: { status: 503, data: { error: 'Service unavailable' } } });

    await expect(
      generateMusic({ title: 'T', genre: 'pop', mood: 'happy', type: 'song', tier: 'basic' })
    ).rejects.toBeDefined();
  });
});
