const axios = require('axios');

const tempolorClient = axios.create({
  baseURL: process.env.TEMPOLOR_BASE_URL,
  headers: { Authorization: `Bearer ${process.env.TEMPOLOR_API_KEY}` },
  timeout: 30000
});

async function withRetry(fn, maxRetries = 3, delayMs = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, delayMs * Math.pow(2, i)));
    }
  }
}

async function generateMusic({ title, genre, mood, type, tier }) {
  const model = type === 'instrumental'
    ? process.env.TEMPOLOR_INSTRUMENTAL_MODEL
    : process.env.TEMPOLOR_SONG_MODEL;

  const quality = tier === 'premium' ? 'high'
    : tier === 'pro' ? 'medium'
    : 'standard';

  const response = await withRetry(() =>
    tempolorClient.post('/generate', {
      model,
      title,
      genre,
      mood,
      output_formats: ['mp3', 'wav'],
      quality
    })
  );

  return response.data.job_id;
}

module.exports = { generateMusic, withRetry };
