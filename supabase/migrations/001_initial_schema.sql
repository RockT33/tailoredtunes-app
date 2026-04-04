-- TailoredTunes Initial Schema
-- Run in Supabase SQL Editor
-- Database Engineer: TAI-11

-- ── users ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT UNIQUE NOT NULL,
  password          TEXT NOT NULL,
  name              TEXT,
  tier              TEXT DEFAULT 'basic' CHECK (tier IN ('basic', 'pro', 'premium')),
  stripe_customer_id TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ── orders ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier                 TEXT NOT NULL CHECK (tier IN ('basic', 'pro', 'premium')),
  title                TEXT NOT NULL,
  genre                TEXT NOT NULL,
  mood                 TEXT NOT NULL,
  type                 TEXT NOT NULL CHECK (type IN ('song', 'instrumental')),
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','payment_complete','generating','complete','failed')),
  stripe_session_id    TEXT,
  stripe_payment_intent TEXT,
  tempolor_job_id      TEXT,
  audio_mp3_url        TEXT,
  audio_wav_url        TEXT,
  error_message        TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id   ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status    ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_stripe    ON orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_tempolor  ON orders(tempolor_job_id);

-- ── analytics_events ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_time ON analytics_events(created_at DESC);

-- ── updated_at trigger ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
