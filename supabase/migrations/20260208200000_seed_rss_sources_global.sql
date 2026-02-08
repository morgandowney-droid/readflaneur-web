-- Seed RSS sources for the ~58 cities missing coverage
-- Uses ON CONFLICT (feed_url) DO NOTHING for idempotency

INSERT INTO rss_sources (city, name, feed_url) VALUES

  -- ═══════════════════════════════════════════════════════════════
  -- NORTH AMERICA — Missing cities
  -- ═══════════════════════════════════════════════════════════════

  -- The Hamptons
  ('The Hamptons', '27east', 'https://www.27east.com/feed/'),
  ('The Hamptons', 'Dan''s Papers', 'https://www.danspapers.com/feed/'),

  -- Connecticut (Greenwich area)
  ('Connecticut', 'Greenwich Time', 'https://www.greenwichtime.com/feed/'),
  ('Connecticut', 'CT Insider', 'https://www.ctinsider.com/feed/'),

  -- Boston
  ('Boston', 'Eater Boston', 'https://boston.eater.com/rss/index.xml'),
  ('Boston', 'Boston Globe Metro', 'https://www.bostonglobe.com/rss/metro'),
  ('Boston', 'Boston Magazine', 'https://www.bostonmagazine.com/feed/'),

  -- Atlanta
  ('Atlanta', 'Eater Atlanta', 'https://atlanta.eater.com/rss/index.xml'),
  ('Atlanta', 'Atlanta Magazine', 'https://www.atlantamagazine.com/feed/'),

  -- Philadelphia
  ('Philadelphia', 'Eater Philly', 'https://philly.eater.com/rss/index.xml'),
  ('Philadelphia', 'PhillyVoice', 'https://www.phillyvoice.com/rss/'),
  ('Philadelphia', 'Billy Penn', 'https://billypenn.com/feed/'),

  -- Montreal
  ('Montreal', 'Montreal Gazette', 'https://montrealgazette.com/feed/'),
  ('Montreal', 'MTL Blog', 'https://www.mtlblog.com/feed/'),

  -- California (general — covers Santa Barbara too)
  ('California', 'LAist', 'https://laist.com/feed'),
  ('California', 'Noozhawk', 'https://www.noozhawk.com/feed/'),

  -- Santa Barbara
  ('Santa Barbara', 'Santa Barbara Independent', 'https://www.independent.com/feed/'),
  ('Santa Barbara', 'Noozhawk SB', 'https://www.noozhawk.com/feed/santa_barbara'),

  -- Vancouver
  ('Vancouver', 'Daily Hive Vancouver', 'https://dailyhive.com/vancouver/feed'),
  ('Vancouver', 'Vancouver Sun', 'https://vancouversun.com/feed/'),

  -- Dallas
  ('Dallas', 'CultureMap Dallas', 'https://dallas.culturemap.com/feed/'),
  ('Dallas', 'D Magazine', 'https://www.dmagazine.com/feed/'),

  -- Houston
  ('Houston', 'CultureMap Houston', 'https://houston.culturemap.com/feed/'),
  ('Houston', 'Houston Chronicle', 'https://www.houstonchronicle.com/rss/feed/'),

  -- Austin
  ('Austin', 'CultureMap Austin', 'https://austin.culturemap.com/feed/'),
  ('Austin', 'Eater Austin', 'https://austin.eater.com/rss/index.xml'),

  -- Colorado (Aspen area)
  ('Colorado', 'Aspen Times', 'https://www.aspentimes.com/feed/'),
  ('Colorado', 'Aspen Daily News', 'https://www.aspendailynews.com/search/?f=rss&t=article'),

  -- Wyoming (Jackson Hole area)
  ('Wyoming', 'Jackson Hole News', 'https://www.jhnewsandguide.com/search/?f=rss&t=article'),

  -- Denver
  ('Denver', 'Westword Denver', 'https://www.westword.com/feed'),
  ('Denver', 'Eater Denver', 'https://denver.eater.com/rss/index.xml'),
  ('Denver', '5280 Magazine', 'https://www.5280.com/feed/'),

  -- Seattle
  ('Seattle', 'Eater Seattle', 'https://seattle.eater.com/rss/index.xml'),
  ('Seattle', 'Seattle Met', 'https://www.seattlemet.com/feed/'),
  ('Seattle', 'The Stranger', 'https://www.thestranger.com/feed'),

  -- Mexico City
  ('Mexico City', 'Mexico News Daily', 'https://mexiconewsdaily.com/feed/'),
  ('Mexico City', 'El Universal English', 'https://www.eluniversal.com.mx/rss.xml'),

  -- Florida (Palm Beach area)
  ('Florida', 'Palm Beach Daily News', 'https://www.palmbeachdailynews.com/rss/'),
  ('Florida', 'Palm Beach Post', 'https://www.palmbeachpost.com/rss/'),

  -- ═══════════════════════════════════════════════════════════════
  -- EUROPE — Missing cities
  -- ═══════════════════════════════════════════════════════════════

  -- Dublin
  ('Dublin', 'Dublin Live', 'https://www.dublinlive.ie/news/?service=rss'),
  ('Dublin', 'The Journal', 'https://www.thejournal.ie/feed/'),
  ('Dublin', 'Irish Times', 'https://www.irishtimes.com/cmlink/the-irish-times-news-1.1319192'),

  -- Nice
  ('Nice', 'Riviera Times', 'https://www.rivieratimes.com/feed/'),
  ('Nice', 'The Local France', 'https://www.thelocal.fr/feed/'),

  -- French Riviera (Cap Ferrat, Antibes, Cannes)
  ('French Riviera', 'Riviera Times', 'https://www.rivieratimes.com/feed/french-riviera'),
  ('French Riviera', 'Monaco Life', 'https://monacolife.net/feed/'),

  -- Monaco
  ('Monaco', 'Monaco Tribune', 'https://www.monaco-tribune.com/en/feed/'),
  ('Monaco', 'Monaco Life EN', 'https://monacolife.net/category/news/feed/'),

  -- Alps (Courchevel, Chamonix)
  ('Alps', 'The Local France Alps', 'https://www.thelocal.fr/tag/alps/feed/'),
  ('Alps', 'Savoie Mont Blanc', 'https://www.savoie-mont-blanc.com/en/feed/'),

  -- Munich
  ('Munich', 'Munich Eye', 'https://municheye.com/feed/'),
  ('Munich', 'The Local Germany', 'https://www.thelocal.de/tag/munich/feed/'),

  -- Hamburg
  ('Hamburg', 'The Local Germany Hamburg', 'https://www.thelocal.de/tag/hamburg/feed/'),
  ('Hamburg', 'Hamburg News', 'https://www.hamburg-news.hamburg/en/feed/'),

  -- Oslo
  ('Oslo', 'The Local Norway', 'https://www.thelocal.no/feed/'),
  ('Oslo', 'Norway Today', 'https://norwaytoday.info/feed/'),

  -- Brussels
  ('Brussels', 'Brussels Times', 'https://www.brusselstimes.com/feed/'),
  ('Brussels', 'The Bulletin', 'https://www.thebulletin.be/feed/'),

  -- Zurich
  ('Zurich', 'The Local Switzerland', 'https://www.thelocal.ch/feed/'),
  ('Zurich', 'SWI swissinfo', 'https://www.swissinfo.ch/eng/rss/'),

  -- Geneva
  ('Geneva', 'The Local Switzerland Geneva', 'https://www.thelocal.ch/tag/geneva/feed/'),
  ('Geneva', 'Geneva Solutions', 'https://genevasolutions.news/feed/'),

  -- Swiss Alps (St. Moritz, Gstaad)
  ('Swiss Alps', 'SWI swissinfo Alps', 'https://www.swissinfo.ch/eng/tourism/rss/'),
  ('Swiss Alps', 'The Local Switzerland', 'https://www.thelocal.ch/tag/alps/feed/'),

  -- Rome
  ('Rome', 'Wanted in Rome', 'https://www.wantedinrome.com/feed/'),
  ('Rome', 'The Local Italy Rome', 'https://www.thelocal.it/tag/rome/feed/'),

  -- Lombardy (Lake Como area)
  ('Lombardy', 'The Local Italy Lombardy', 'https://www.thelocal.it/tag/lombardy/feed/'),
  ('Lombardy', 'Wanted in Milan', 'https://www.wantedinmilan.com/feed/'),

  -- Liguria (Portofino area)
  ('Liguria', 'The Local Italy Liguria', 'https://www.thelocal.it/tag/liguria/feed/'),
  ('Liguria', 'Riviera di Levante', 'https://www.thelocal.it/feed/'),

  -- Campania (Amalfi, Capri)
  ('Campania', 'The Local Italy Campania', 'https://www.thelocal.it/tag/campania/feed/'),
  ('Campania', 'Wanted in Rome South', 'https://www.wantedinrome.com/feed/'),

  -- Madrid
  ('Madrid', 'The Local Spain Madrid', 'https://www.thelocal.es/tag/madrid/feed/'),
  ('Madrid', 'Madrid Metropolitan', 'https://madridmetropolitan.com/feed/'),

  -- Ibiza
  ('Ibiza', 'Ibiza Spotlight', 'https://www.ibiza-spotlight.com/feed/'),
  ('Ibiza', 'The Local Spain Ibiza', 'https://www.thelocal.es/tag/ibiza/feed/'),

  -- Marbella
  ('Marbella', 'Olive Press Spain', 'https://www.theolivepress.es/feed/'),
  ('Marbella', 'Sur in English', 'https://www.surinenglish.com/rss/'),

  -- Andalusia
  ('Andalusia', 'Olive Press Andalusia', 'https://www.theolivepress.es/spain-news/andalucia-news/feed/'),
  ('Andalusia', 'Euro Weekly Andalusia', 'https://euroweeklynews.com/category/costa-del-sol/feed/'),

  -- Alentejo (Portugal)
  ('Alentejo', 'Portugal News Alentejo', 'https://www.theportugalnews.com/feed'),
  ('Alentejo', 'Portugal Resident', 'https://www.portugalresident.com/feed/'),

  -- Athens
  ('Athens', 'Kathimerini English', 'https://www.ekathimerini.com/rss/'),
  ('Athens', 'Greek Reporter', 'https://greekreporter.com/feed/'),

  -- Mykonos
  ('Mykonos', 'Greek Reporter Mykonos', 'https://greekreporter.com/tag/mykonos/feed/'),
  ('Mykonos', 'Greece Is', 'https://www.greece-is.com/feed/'),

  -- ═══════════════════════════════════════════════════════════════
  -- ASIA-PACIFIC — Missing cities
  -- ═══════════════════════════════════════════════════════════════

  -- Hokkaido
  ('Hokkaido', 'Japan Times Hokkaido', 'https://www.japantimes.co.jp/tag/hokkaido/feed/'),
  ('Hokkaido', 'Hokkaido Wilds', 'https://hokkaidowilds.org/feed/'),

  -- Seoul
  ('Seoul', 'Korea Herald', 'https://www.koreaherald.com/rss/'),
  ('Seoul', 'Korea JoongAng Daily', 'https://koreajoongangdaily.joins.com/rss/'),
  ('Seoul', 'Seoul Magazine', 'https://magazine.seoulselection.com/feed/'),

  -- Shanghai
  ('Shanghai', 'Shine Shanghai', 'https://www.shine.cn/rss/'),
  ('Shanghai', 'That''s Shanghai', 'https://www.thatsmags.com/shanghai/feed/'),

  -- Beijing
  ('Beijing', 'The Beijinger', 'https://www.thebeijinger.com/feed/'),
  ('Beijing', 'That''s Beijing', 'https://www.thatsmags.com/beijing/feed/'),

  -- Bangkok
  ('Bangkok', 'Bangkok Post', 'https://www.bangkokpost.com/rss/'),
  ('Bangkok', 'BK Magazine', 'https://bk.asia-city.com/feed/'),

  -- Bali
  ('Bali', 'Coconuts Bali', 'https://coconuts.co/bali/feed/'),
  ('Bali', 'Bali Times', 'https://www.thebalitimes.com/feed/'),

  -- Jakarta
  ('Jakarta', 'Jakarta Post', 'https://www.thejakartapost.com/feed/'),
  ('Jakarta', 'Coconuts Jakarta', 'https://coconuts.co/jakarta/feed/'),

  -- Auckland
  ('Auckland', 'NZ Herald', 'https://www.nzherald.co.nz/arc/outboundfeeds/rss/curated/78/'),
  ('Auckland', 'Concrete Playground Auckland', 'https://concreteplayground.com/auckland/feed'),

  -- ═══════════════════════════════════════════════════════════════
  -- MIDDLE EAST & AFRICA — Missing cities
  -- ═══════════════════════════════════════════════════════════════

  -- Riyadh
  ('Riyadh', 'Arab News', 'https://www.arabnews.com/rss.xml'),
  ('Riyadh', 'Saudi Gazette', 'https://saudigazette.com.sa/rss/'),

  -- Cape Town
  ('Cape Town', 'News24 Cape Town', 'https://feeds.24.com/articles/news24/SouthAfrica/rss'),
  ('Cape Town', 'Daily Maverick', 'https://www.dailymaverick.co.za/feed/'),
  ('Cape Town', 'Cape Town Etc', 'https://www.capetownetc.com/feed/'),

  -- Johannesburg
  ('Johannesburg', 'News24 Johannesburg', 'https://feeds.24.com/articles/news24/SouthAfrica/Johannesburg/rss'),
  ('Johannesburg', 'Daily Maverick JHB', 'https://www.dailymaverick.co.za/section/south-africa/feed/'),

  -- Cairo
  ('Cairo', 'Egypt Independent', 'https://www.egyptindependent.com/feed/'),
  ('Cairo', 'Ahram Online', 'https://english.ahram.org.eg/rss/'),

  -- ═══════════════════════════════════════════════════════════════
  -- SOUTH AMERICA — All new (zero coverage previously)
  -- ═══════════════════════════════════════════════════════════════

  -- São Paulo
  ('São Paulo', 'Rio Times Brazil', 'https://www.riotimesonline.com/feed/'),
  ('São Paulo', 'Brazil Journal EN', 'https://braziljournal.com/feed/'),

  -- Rio de Janeiro
  ('Rio de Janeiro', 'Rio Times', 'https://www.riotimesonline.com/category/rio-de-janeiro/feed/'),
  ('Rio de Janeiro', 'O Globo EN', 'https://oglobo.globo.com/rss/'),

  -- Buenos Aires
  ('Buenos Aires', 'Buenos Aires Times', 'https://www.batimes.com.ar/feed/'),
  ('Buenos Aires', 'Argentina Independent', 'https://www.argentinaindependent.com/feed/'),

  -- Santiago
  ('Santiago', 'Santiago Times', 'https://santiagotimes.cl/feed/'),
  ('Santiago', 'Chile Today', 'https://chiletoday.cl/feed/'),

  -- Medellín
  ('Medellín', 'Colombia Reports', 'https://colombiareports.com/feed/'),
  ('Medellín', 'Medellin Living', 'https://medellinliving.com/feed/')

ON CONFLICT (feed_url) DO NOTHING;
