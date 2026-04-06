const { supabaseAdmin } = require('../config/supabase');

const BUCKET = 'audio-files';
// Signed URL TTL: 7 days (generated fresh on every order fetch, never stored)
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;

async function uploadAudioToStorage(jobId, mp3Url, wavUrl) {
  const [mp3Res, wavRes] = await Promise.all([
    fetch(mp3Url),
    fetch(wavUrl)
  ]);

  if (!mp3Res.ok) throw new Error(`Failed to fetch MP3: ${mp3Res.status}`);
  if (!wavRes.ok) throw new Error(`Failed to fetch WAV: ${wavRes.status}`);

  const [mp3Buffer, wavBuffer] = await Promise.all([
    mp3Res.arrayBuffer(),
    wavRes.arrayBuffer()
  ]);

  const mp3Path = `audio/${jobId}/track.mp3`;
  const wavPath = `audio/${jobId}/track.wav`;

  const [mp3Upload, wavUpload] = await Promise.all([
    supabaseAdmin.storage.from(BUCKET).upload(mp3Path, mp3Buffer, { contentType: 'audio/mpeg' }),
    supabaseAdmin.storage.from(BUCKET).upload(wavPath, wavBuffer, { contentType: 'audio/wav' })
  ]);

  if (mp3Upload.error) throw new Error(`MP3 upload failed: ${mp3Upload.error.message}`);
  if (wavUpload.error) throw new Error(`WAV upload failed: ${wavUpload.error.message}`);

  // Return storage paths (not signed URLs) so they never expire in the DB
  return [mp3Path, wavPath];
}

// Generate fresh signed URLs from stored paths (called at serve time, not stored)
async function getSignedUrls(mp3Path, wavPath) {
  const [mp3Signed, wavSigned] = await Promise.all([
    mp3Path
      ? supabaseAdmin.storage.from(BUCKET).createSignedUrl(mp3Path, SIGNED_URL_TTL)
      : Promise.resolve({ data: null, error: null }),
    wavPath
      ? supabaseAdmin.storage.from(BUCKET).createSignedUrl(wavPath, SIGNED_URL_TTL)
      : Promise.resolve({ data: null, error: null })
  ]);

  if (mp3Signed.error) throw new Error(`MP3 signed URL failed: ${mp3Signed.error.message}`);
  if (wavSigned.error) throw new Error(`WAV signed URL failed: ${wavSigned.error.message}`);

  return [mp3Signed.data?.signedUrl || null, wavSigned.data?.signedUrl || null];
}

module.exports = { uploadAudioToStorage, getSignedUrls };
