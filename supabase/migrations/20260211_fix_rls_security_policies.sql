-- Fix RLS security vulnerabilities flagged by Supabase Security Advisor
-- 1. Enable RLS on blocked_words (was missing entirely)
-- 2. Fix overly permissive policies on 5 tables (missing TO service_role clause)

-- ═══════════════════════════════════════════════════════════════
-- 1. blocked_words: Enable RLS + add service_role-only policy
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE blocked_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on blocked_words"
  ON blocked_words FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 2. instant_resend_log: Replace wide-open policy with service_role-only
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Service role full access on instant_resend_log" ON instant_resend_log;

CREATE POLICY "Service role full access on instant_resend_log"
  ON instant_resend_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 3. daily_brief_sends: Replace wide-open policy with service_role-only
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Service role full access on daily_brief_sends" ON daily_brief_sends;

CREATE POLICY "Service role full access on daily_brief_sends"
  ON daily_brief_sends FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 4. weekly_briefs: Replace wide-open policy with service_role-only
--    (Keep the authenticated read policy - it's intentional)
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Service role full access on weekly_briefs" ON weekly_briefs;

CREATE POLICY "Service role full access on weekly_briefs"
  ON weekly_briefs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 5. weekly_brief_sends: Replace wide-open policy with service_role-only
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Service role full access on weekly_brief_sends" ON weekly_brief_sends;

CREATE POLICY "Service role full access on weekly_brief_sends"
  ON weekly_brief_sends FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 6. rss_sources: Replace wide-open policy with service_role-only
--    (Keep the public read policy for active sources - it's intentional)
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Service role has full access to rss sources" ON rss_sources;

CREATE POLICY "Service role has full access to rss sources"
  ON rss_sources FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
