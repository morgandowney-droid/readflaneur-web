-- Translation tables for pre-translated content (Gemini Flash)

CREATE TABLE article_translations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  preview_text TEXT,
  translated_at TIMESTAMPTZ DEFAULT NOW(),
  model TEXT DEFAULT 'gemini-2.5-flash',
  UNIQUE(article_id, language_code)
);

CREATE TABLE brief_translations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brief_id UUID NOT NULL REFERENCES neighborhood_briefs(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  content TEXT NOT NULL,
  enriched_content TEXT,
  translated_at TIMESTAMPTZ DEFAULT NOW(),
  model TEXT DEFAULT 'gemini-2.5-flash',
  UNIQUE(brief_id, language_code)
);

CREATE INDEX idx_article_translations_lookup ON article_translations(article_id, language_code);
CREATE INDEX idx_brief_translations_lookup ON brief_translations(brief_id, language_code);

-- RLS: public read, service_role write
ALTER TABLE article_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE brief_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "article_translations_public_read" ON article_translations
  FOR SELECT USING (true);

CREATE POLICY "article_translations_service_write" ON article_translations
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "brief_translations_public_read" ON brief_translations
  FOR SELECT USING (true);

CREATE POLICY "brief_translations_service_write" ON brief_translations
  FOR ALL USING (auth.role() = 'service_role');
