-- RSS Sources Table
-- Allows managing RSS feed sources via admin UI

CREATE TABLE IF NOT EXISTS rss_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  name TEXT NOT NULL,
  feed_url TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  last_fetched_at TIMESTAMPTZ,
  last_error TEXT,
  articles_found_total INTEGER DEFAULT 0,
  articles_found_7d INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups by city
CREATE INDEX IF NOT EXISTS idx_rss_sources_city ON rss_sources(city);
CREATE INDEX IF NOT EXISTS idx_rss_sources_active ON rss_sources(is_active);

-- Insert default RSS sources
INSERT INTO rss_sources (city, name, feed_url) VALUES
  -- New York
  ('New York', 'Curbed NY', 'https://ny.curbed.com/rss/index.xml'),
  ('New York', 'Grub Street', 'https://www.grubstreet.com/feed/rss'),
  ('New York', 'Gothamist', 'https://gothamist.com/feed'),
  ('New York', 'The City NYC', 'https://www.thecity.nyc/feed'),
  ('New York', 'NY Post Metro', 'https://nypost.com/metro/feed/'),

  -- London
  ('London', 'Evening Standard', 'https://www.standard.co.uk/rss'),
  ('London', 'Londonist', 'https://londonist.com/feed'),
  ('London', 'Time Out London', 'https://www.timeout.com/london/rss'),

  -- San Francisco
  ('San Francisco', 'SF Standard', 'https://sfstandard.com/feed/'),
  ('San Francisco', 'SFist', 'https://sfist.com/feed/'),
  ('San Francisco', 'Hoodline SF', 'https://hoodline.com/feeds/san-francisco.rss'),

  -- Los Angeles
  ('Los Angeles', 'LAist', 'https://laist.com/feed'),
  ('Los Angeles', 'Eater LA', 'https://la.eater.com/rss/index.xml'),
  ('Los Angeles', 'LA Curbed', 'https://la.curbed.com/rss/index.xml'),

  -- Chicago
  ('Chicago', 'Block Club Chicago', 'https://blockclubchicago.org/feed/'),
  ('Chicago', 'Chicago Reader', 'https://chicagoreader.com/feed/'),
  ('Chicago', 'Eater Chicago', 'https://chicago.eater.com/rss/index.xml'),

  -- Miami
  ('Miami', 'Miami New Times', 'https://www.miaminewtimes.com/miami/Rss.xml'),
  ('Miami', 'Eater Miami', 'https://miami.eater.com/rss/index.xml'),

  -- Washington DC
  ('Washington DC', 'DCist', 'https://dcist.com/feed'),
  ('Washington DC', 'Washingtonian', 'https://www.washingtonian.com/feed/'),

  -- Paris
  ('Paris', 'The Local France', 'https://www.thelocal.fr/feed/'),
  ('Paris', 'Paris Update', 'https://www.parisupdate.com/feed/'),

  -- Berlin
  ('Berlin', 'The Local Germany', 'https://www.thelocal.de/feed/'),
  ('Berlin', 'ExBerliner', 'https://www.exberliner.com/feed/'),

  -- Amsterdam
  ('Amsterdam', 'DutchNews', 'https://www.dutchnews.nl/feed/'),
  ('Amsterdam', 'I Amsterdam', 'https://www.iamsterdam.com/en/rss'),

  -- Stockholm
  ('Stockholm', 'The Local Sweden', 'https://www.thelocal.se/feed/'),

  -- Copenhagen
  ('Copenhagen', 'The Local Denmark', 'https://www.thelocal.dk/feed/'),
  ('Copenhagen', 'Copenhagen Post', 'https://cphpost.dk/feed/'),

  -- Barcelona
  ('Barcelona', 'The Local Spain', 'https://www.thelocal.es/feed/'),
  ('Barcelona', 'Barcelona Metropolitan', 'https://www.barcelona-metropolitan.com/feed/'),

  -- Milan
  ('Milan', 'The Local Italy', 'https://www.thelocal.it/feed/'),

  -- Lisbon
  ('Lisbon', 'The Portugal News', 'https://www.theportugalnews.com/feed'),

  -- Tokyo
  ('Tokyo', 'Time Out Tokyo', 'https://www.timeout.com/tokyo/rss'),
  ('Tokyo', 'Japan Times', 'https://www.japantimes.co.jp/feed/'),

  -- Hong Kong
  ('Hong Kong', 'Time Out Hong Kong', 'https://www.timeout.com/hong-kong/rss'),
  ('Hong Kong', 'South China Morning Post', 'https://www.scmp.com/rss/91/feed'),

  -- Singapore
  ('Singapore', 'Time Out Singapore', 'https://www.timeout.com/singapore/rss'),
  ('Singapore', 'Straits Times', 'https://www.straitstimes.com/news/singapore/rss.xml'),

  -- Sydney
  ('Sydney', 'Broadsheet Sydney', 'https://www.broadsheet.com.au/sydney/rss'),
  ('Sydney', 'Time Out Sydney', 'https://www.timeout.com/sydney/rss'),
  ('Sydney', 'Urban List Sydney', 'https://www.theurbanlist.com/sydney/rss'),

  -- Melbourne
  ('Melbourne', 'Broadsheet Melbourne', 'https://www.broadsheet.com.au/melbourne/rss'),
  ('Melbourne', 'Time Out Melbourne', 'https://www.timeout.com/melbourne/rss'),

  -- Toronto
  ('Toronto', 'BlogTO', 'https://www.blogto.com/feed/'),
  ('Toronto', 'Toronto Star', 'https://www.thestar.com/search/?f=rss'),

  -- Dubai
  ('Dubai', 'Time Out Dubai', 'https://www.timeoutdubai.com/rss'),
  ('Dubai', 'Gulf News', 'https://gulfnews.com/rss'),

  -- Tel Aviv
  ('Tel Aviv', 'Time Out Israel', 'https://www.timeout.com/israel/rss'),
  ('Tel Aviv', 'Haaretz', 'https://www.haaretz.com/cmlink/1.628765')
ON CONFLICT (feed_url) DO NOTHING;

-- Enable RLS
ALTER TABLE rss_sources ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Anyone can read active rss sources"
  ON rss_sources FOR SELECT
  USING (is_active = true);

-- Allow service role full access
CREATE POLICY "Service role has full access to rss sources"
  ON rss_sources FOR ALL
  USING (true)
  WITH CHECK (true);
