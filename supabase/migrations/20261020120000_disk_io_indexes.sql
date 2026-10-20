-- Disk IO budget warnings (Supabase, 8 and 20 Oct 2026).
--
-- pg_stat_user_tables since the June stats reset: 206,479 sequential scans of
-- articles (243 MB) and 22,962 of neighborhood_briefs (312 MB), about 1,700 and
-- 190 a day, on an instance whose RAM is a fraction of the 3.4 GB database.
-- Every one of those scans came off disk. The briefs scans are the two
-- 15-minute crons (flag-brief-stories filters created_at, generate-brief-articles
-- filters generated_at; neither column was indexed). The articles scans are the
-- per-neighborhood checks in generate-look-ahead, the continuity context in
-- enrich-briefs, the missing-image sweeps and the RSS dedup: articles had no
-- index on neighborhood_id or created_at at all.
--
-- Also dropped: the trigram GIN indexes on body_text (183 MB, 97 MB of it bloat)
-- and preview_text (37 MB). Used 32 times in four months by /api/search, yet
-- rewritten on every article insert and enrichment update. The headline trigram
-- index (17 MB) stays; a body search falls back to a scan, fine at that rate.
--
-- Plain CREATE INDEX (the CLI runs migrations in a transaction, so CONCURRENTLY
-- is not available): each articles index takes a short write lock. Apply in the
-- quiet hours, 08:00 to 16:00 UTC, never in the 22:00 to 07:00 UTC generation window.

create index if not exists idx_articles_neighborhood_created
  on public.articles (neighborhood_id, created_at desc);
create index if not exists idx_articles_neighborhood_published
  on public.articles (neighborhood_id, published_at desc);
create index if not exists idx_articles_created_at
  on public.articles (created_at desc);
create index if not exists idx_articles_missing_image
  on public.articles (created_at desc)
  where image_url is null or image_url = '';

create index if not exists idx_neighborhood_briefs_created_at
  on public.neighborhood_briefs (created_at desc);
create index if not exists idx_neighborhood_briefs_generated_at
  on public.neighborhood_briefs (generated_at desc);
create index if not exists idx_neighborhood_briefs_unenriched
  on public.neighborhood_briefs (generated_at desc)
  where enriched_content is null;

drop index if exists public.idx_articles_search_body_trgm;
drop index if exists public.idx_articles_search_preview_trgm;

-- Never analysed since the stats reset: the planner thinks these 1 GB tables
-- hold 866 and 2,165 rows (they hold 200,000 and 376,000).
analyze public.brief_translations;
analyze public.article_translations;
