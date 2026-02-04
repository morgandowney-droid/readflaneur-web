-- Add category_label column for displaying category tags on articles
ALTER TABLE articles
ADD COLUMN IF NOT EXISTS category_label TEXT;
