const { supabaseAdmin } = require('../config/supabase');
const { uploadAudioToStorage } = require('../integrations/storage');

async function handleTempolorWebhook(req, res) {
  const { job_id, status, mp3_url, wav_url, error } = req.body;

  if (!job_id) {
    return res.status(400).json({ error: 'Missing job_id', code: 'MISSING_JOB_ID' });
  }

  if (status === 'complete') {
    if (!mp3_url || !wav_url) {
      console.error('[TemPolor webhook] Missing audio URLs for job:', job_id);
      return res.status(400).json({ error: 'Missing audio URLs', code: 'MISSING_URLS' });
    }

    try {
      const [mp3Path, wavPath] = await uploadAudioToStorage(job_id, mp3_url, wav_url);

      const { error: dbErr } = await supabaseAdmin
        .from('orders')
        .update({
          status: 'complete',
          audio_mp3_url: mp3Path,
          audio_wav_url: wavPath
        })
        .eq('tempolor_job_id', job_id);

      if (dbErr) {
        console.error('[TemPolor webhook] DB update failed:', dbErr.message);
        return res.status(500).json({ error: 'DB update failed' });
      }

      console.log(`[TemPolor webhook] Order complete for job: ${job_id}`);
    } catch (uploadErr) {
      console.error('[TemPolor webhook] Audio upload failed:', uploadErr.message);
      await supabaseAdmin
        .from('orders')
        .update({ status: 'failed', error_message: uploadErr.message })
        .eq('tempolor_job_id', job_id);
      return res.status(500).json({ error: 'Audio upload failed' });
    }
  } else if (status === 'failed') {
    const { error: dbErr } = await supabaseAdmin
      .from('orders')
      .update({ status: 'failed', error_message: error || 'TemPolor generation failed' })
      .eq('tempolor_job_id', job_id);

    if (dbErr) {
      console.error('[TemPolor webhook] DB update failed:', dbErr.message);
      return res.status(500).json({ error: 'DB update failed' });
    }

    console.log(`[TemPolor webhook] Job failed: ${job_id} — ${error}`);
  } else {
    console.log(`[TemPolor webhook] Unhandled status "${status}" for job: ${job_id}`);
  }

  res.json({ received: true });
}

module.exports = { handleTempolorWebhook };
