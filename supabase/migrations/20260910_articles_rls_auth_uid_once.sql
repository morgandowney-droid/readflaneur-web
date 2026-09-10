-- Context (2026-09-10): search returned 500 on every query because the anon
-- role's ILIKE over `articles` did a sequential scan of 80k rows (6.6s) and
-- hit the 3s statement timeout. The real cause is a Postgres rule, not this
-- policy: under row-level security a non-leakproof operator (ILIKE, `~~*`)
-- cannot be used as an index condition, so the trigram indexes are ignored
-- for any RLS-bound role. The fix for search is in the API route, which now
-- reads with the service role (no RLS, Bitmap Index Scan, ~50ms) and filters
-- to status = 'published' itself.
--
-- This migration is the hygiene found on the way: "Authors can manage own
-- articles" called auth.uid() per row and applied to anon as well. Per
-- Supabase's RLS guidance, wrap auth.uid() in a subselect so it is evaluated
-- once per statement, and scope the policy TO authenticated so the anon role
-- never evaluates it at all.

DROP POLICY IF EXISTS "Authors can manage own articles" ON public.articles;

CREATE POLICY "Authors can manage own articles"
  ON public.articles
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = author_id)
  WITH CHECK ((SELECT auth.uid()) = author_id);

-- author_id is compared on every authenticated read; keep it indexed.
CREATE INDEX IF NOT EXISTS idx_articles_author_id ON public.articles (author_id);
