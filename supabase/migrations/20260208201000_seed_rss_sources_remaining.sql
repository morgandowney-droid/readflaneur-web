-- Seed RSS sources for the remaining 6 cities missing coverage
-- These are pre-Flaneur-200 neighborhoods with different city values

INSERT INTO rss_sources (city, name, feed_url) VALUES
  -- Greenwich (separate from Connecticut)
  ('Greenwich', 'Greenwich Time', 'https://www.greenwichtime.com/local/feed/'),
  ('Greenwich', 'Greenwich Sentinel', 'https://www.greenwichsentinel.com/feed/'),

  -- Ireland (general)
  ('Ireland', 'Irish Times', 'https://www.irishtimes.com/cmlink/news-1.1319192'),
  ('Ireland', 'RTE News', 'https://www.rte.ie/news/rss/news-headlines.xml'),

  -- Limerick
  ('Limerick', 'Limerick Post', 'https://www.limerickpost.ie/feed/'),
  ('Limerick', 'Limerick Leader', 'https://www.limerickleader.ie/news/rss/'),

  -- Queenstown (New Zealand)
  ('Queenstown', 'NZ Herald Queenstown', 'https://www.nzherald.co.nz/arc/outboundfeeds/rss/section/nz/'),
  ('Queenstown', 'Stuff NZ', 'https://www.stuff.co.nz/rss'),

  -- Sweden (general)
  ('Sweden', 'The Local Sweden', 'https://www.thelocal.se/tag/sweden/feed/'),
  ('Sweden', 'Sweden News EN', 'https://www.thelocal.se/feed/'),

  -- Sylt (Germany)
  ('Sylt', 'The Local Germany', 'https://www.thelocal.de/tag/travel/feed/'),
  ('Sylt', 'DW Germany', 'https://rss.dw.com/xml/rss-en-ger')

ON CONFLICT (feed_url) DO NOTHING;
