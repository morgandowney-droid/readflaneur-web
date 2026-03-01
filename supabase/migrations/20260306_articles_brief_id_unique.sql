-- Fix duplicate brief_summary articles caused by two code paths (cron + assembler fallback)
-- generating articles from the same brief with different slugs.

-- Step 1: Delete article_sources for all duplicate articles (keep oldest per brief_id)
WITH keep AS (
  SELECT DISTINCT ON (brief_id) id
  FROM articles
  WHERE brief_id IS NOT NULL
  ORDER BY brief_id, created_at ASC, id ASC
)
DELETE FROM article_sources WHERE article_id IN (
  SELECT id FROM articles WHERE brief_id IS NOT NULL AND id NOT IN (SELECT id FROM keep)
);

-- Step 2: Delete duplicate articles (keep oldest per brief_id)
WITH keep AS (
  SELECT DISTINCT ON (brief_id) id
  FROM articles
  WHERE brief_id IS NOT NULL
  ORDER BY brief_id, created_at ASC, id ASC
)
DELETE FROM articles
WHERE brief_id IS NOT NULL AND id NOT IN (SELECT id FROM keep);

-- Step 3: Add unique partial index to prevent future duplicates
CREATE UNIQUE INDEX articles_brief_id_unique ON articles(brief_id) WHERE brief_id IS NOT NULL;
