-- Trigram indexes for /api/search ilike performance.
--
-- Before: `body_text ILIKE '%query%'` over published articles forces a
-- sequential scan and routinely times out at the Vercel gateway, which the
-- frontend silently renders as "No results found".
--
-- After: GIN trigram indexes let Postgres use the index for substring matches
-- of >=3 characters. Partial WHERE status='published' keeps the indexes small
-- since unpublished rows are never searched.
--
-- Build time on a multi-100K article table is on the order of 30-90s and
-- briefly blocks writes during construction. Run during a quiet window.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_articles_search_headline_trgm
  ON articles USING gin (headline gin_trgm_ops)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_articles_search_preview_trgm
  ON articles USING gin (preview_text gin_trgm_ops)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_articles_search_body_trgm
  ON articles USING gin (body_text gin_trgm_ops)
  WHERE status = 'published';
