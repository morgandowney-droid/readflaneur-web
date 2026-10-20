-- Disk IO, second pass (20 Oct 2026), from pg_stat_statements ordered by disk
-- blocks read since the June reset (507 GB in all). The morning's migration
-- covers the top two (the 15-minute recent-headlines query, 174 GB, and
-- flag-brief-stories, 88 GB). Three more in the top ten had no usable index:
--
-- 1. archive-article-sources' candidate query (69 GB, 57 MB a run, every 30
--    minutes): filters archived_at IS NULL AND source_snapshot IS NULL AND
--    source_url IS NOT NULL AND created_at >= 48h ago. The existing partial
--    index idx_article_sources_unarchived was built on the older archive_url
--    column, so its predicate is never implied and it has never been scanned.
-- 2. shadow-source-checks' snapshot reuse lookup (11 GB over 200 calls, a full
--    scan of article_sources per URL): source_url = $1 AND archive_url IS NOT
--    NULL. source_url reaches 8,639 bytes, over the btree limit, so a hash
--    index, which serves equality and has no size limit.
-- 3. sync-weekly-brief's Pro-quota counts on neighborhood_briefs and articles
--    (20 GB): enrichment_model = $1 AND enriched_at >= today.
--
-- And articles.image_url (986 bytes at most): retry-missing-images, the image
-- feedback API and swapNegativeImage() look articles up by it, 11,318 times
-- since June, a 58 MB heap scan each time that sat in the buffer cache.

create index if not exists idx_article_sources_archive_queue
  on public.article_sources (created_at)
  where archived_at is null and source_snapshot is null and source_url is not null;
drop index if exists public.idx_article_sources_unarchived;

create index if not exists idx_article_sources_source_url_hash
  on public.article_sources using hash (source_url);

create index if not exists idx_neighborhood_briefs_model_enriched
  on public.neighborhood_briefs (enrichment_model, enriched_at desc);
create index if not exists idx_articles_model_enriched
  on public.articles (enrichment_model, enriched_at desc);

create index if not exists idx_articles_image_url
  on public.articles (image_url);
