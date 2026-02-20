-- Archive all Social Calendar (Gala Watch) articles
-- These look more like advertisements than news stories
UPDATE articles
SET status = 'archived'
WHERE category_label = 'Social Calendar'
  AND status = 'published';
