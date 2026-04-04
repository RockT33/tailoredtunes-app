-- TailoredTunes RLS Policies
-- Database Engineer: TAI-12

-- ── Enable RLS ───────────────────────────────────────────
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events   ENABLE ROW LEVEL SECURITY;

-- ── users ────────────────────────────────────────────────
DROP POLICY IF EXISTS users_select_own ON users;
CREATE POLICY users_select_own ON users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS users_update_own ON users;
CREATE POLICY users_update_own ON users
  FOR UPDATE USING (auth.uid() = id);

-- ── orders ───────────────────────────────────────────────
DROP POLICY IF EXISTS orders_select_own ON orders;
CREATE POLICY orders_select_own ON orders
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS orders_insert_own ON orders;
CREATE POLICY orders_insert_own ON orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── analytics_events ─────────────────────────────────────
DROP POLICY IF EXISTS analytics_insert_own ON analytics_events;
CREATE POLICY analytics_insert_own ON analytics_events
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ── Storage bucket (run in Supabase Storage settings) ────
-- Bucket name: audio-files (private)
-- Service role has full access (bypasses RLS)
-- Policy: users can read files in their own folder
