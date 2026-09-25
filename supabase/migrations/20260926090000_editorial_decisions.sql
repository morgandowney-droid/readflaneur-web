-- Editorial decisions from the licensee editor desk (/editor/[group]).
--
-- GEDI said on 25 Sep 2026 that a human must check anything before it runs
-- under their logo. Their editors approve, hold, edit or restore each item of
-- each morning's editions on the desk; the licensee feed (/api/v1) for a
-- licensee with requireApproval carries only approved items, with edits
-- applied. The public Flaneur pages do not read this table.
--
-- Append-only: one row per action, so the table is also the audit trail. An
-- item's state is the fold of its rows in decided_at order
-- (src/lib/editorial-decisions.ts). 'restored' returns an item to pending with
-- its original text.
--
-- story_key is stable per item: the first 24 hex of
-- sha256(`${article_id}:${item_ref}`), where item_ref is the story position
-- ('0', '1', ...), 'headline', 'prose' or 'event:<n>'. For a story it equals
-- the story id the feed already returns.

CREATE TABLE IF NOT EXISTS public.editorial_decisions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         text NOT NULL,
  neighborhood_id  text NOT NULL,
  article_id       uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  story_key        text NOT NULL,
  item_ref         text NOT NULL,
  action           text NOT NULL CHECK (action IN ('approved', 'held', 'edited', 'restored')),
  edited_header    text,
  edited_text      text,
  decided_by       text NOT NULL,
  decided_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS editorial_decisions_group_article_idx
  ON public.editorial_decisions (group_id, article_id, decided_at);
CREATE INDEX IF NOT EXISTS editorial_decisions_group_key_idx
  ON public.editorial_decisions (group_id, story_key, decided_at);

-- Grants required for Data API access (post Oct 30, 2026). Service role only:
-- the desk and the feed both read and write through the service role.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.editorial_decisions TO service_role;

ALTER TABLE public.editorial_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages editorial decisions" ON public.editorial_decisions;
CREATE POLICY "Service role manages editorial decisions"
  ON public.editorial_decisions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
