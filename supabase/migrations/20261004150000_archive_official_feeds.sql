-- Police, fire and other official news sources found once per area (sources.ts discoverOfficial):
-- [{kind, url, feed}]. Null means not looked for yet.
ALTER TABLE public.archive_area_sources ADD COLUMN IF NOT EXISTS extra_feeds jsonb;
