# Flâneur Platform Architecture

## Overview

Flâneur is a luxury hyper-local news platform serving 120 neighborhoods across 33 cities globally, including vacation destinations and 15 combo neighborhoods that aggregate multiple areas (e.g., SoHo = SoHo + NoHo + NoLita + Hudson Square). The platform combines curated journalism with community-sourced content and local business advertising.

### User Types

- **Readers** - Browse neighborhood feeds, guides, and events
- **Advertisers** - Create and manage local advertisements
- **Admins** - Manage content, users, and Michelin ratings

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 16.1.4 (App Router) |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Payments | Stripe |
| Storage | Supabase Storage (images) |
| Hosting | Vercel |

---

## Database Schema

### Core Tables

```sql
-- Neighborhoods
neighborhoods (
  id TEXT PRIMARY KEY,           -- e.g., 'nyc-west-village'
  name TEXT NOT NULL,            -- e.g., 'West Village'
  city TEXT NOT NULL,            -- e.g., 'New York'
  city_slug TEXT NOT NULL,       -- e.g., 'new-york'
  slug TEXT NOT NULL,            -- e.g., 'west-village'
  country TEXT,
  region TEXT,                   -- e.g., 'north-america', 'us-vacation', 'nyc-enclaves'
  timezone TEXT NOT NULL,
  latitude DECIMAL,
  longitude DECIMAL,
  radius INTEGER,                -- Search radius in meters
  is_active BOOLEAN DEFAULT TRUE,
  is_combo BOOLEAN DEFAULT FALSE, -- True for combo neighborhoods
  article_count INTEGER DEFAULT 0,
  is_trending BOOLEAN DEFAULT FALSE
)

-- Combo Neighborhoods (join table for aggregating multiple areas)
combo_neighborhoods (
  id UUID PRIMARY KEY,
  combo_id TEXT REFERENCES neighborhoods(id),  -- Parent combo (e.g., 'nyc-soho')
  component_id TEXT REFERENCES neighborhoods(id), -- Child area (e.g., 'nyc-noho')
  display_order INTEGER DEFAULT 0,
  UNIQUE(combo_id, component_id)
)

-- User Profiles (extends Supabase Auth)
profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('reader', 'journalist', 'advertiser', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- User Neighborhood Preferences
user_neighborhood_preferences (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  neighborhood_id TEXT REFERENCES neighborhoods(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, neighborhood_id)
)

-- Sections (content categories)
sections (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,            -- e.g., 'Dining', 'Culture'
  slug TEXT UNIQUE NOT NULL,
  icon TEXT,                     -- Emoji or icon name
  display_order INTEGER,
  is_active BOOLEAN DEFAULT TRUE
)
```

### Content Tables

```sql
-- Articles
articles (
  id UUID PRIMARY KEY,
  neighborhood_id TEXT REFERENCES neighborhoods(id),
  section_id UUID REFERENCES sections(id),
  author_id UUID REFERENCES profiles(id),
  headline TEXT NOT NULL,
  slug TEXT UNIQUE,
  body_text TEXT NOT NULL,
  image_url TEXT NOT NULL,
  status TEXT CHECK (status IN ('draft', 'pending', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Guide Listings (curated places)
guide_listings (
  id UUID PRIMARY KEY,
  neighborhood_id TEXT REFERENCES neighborhoods(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,        -- e.g., 'restaurant', 'cafe', 'bar'
  subcategory TEXT,
  address TEXT,
  google_place_id TEXT,
  google_rating DECIMAL,         -- Filtered to 4.0+ in queries
  google_review_count INTEGER,
  price_level INTEGER,           -- 1-4 ($-$$$$)
  website_url TEXT,
  phone TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  michelin_stars INTEGER CHECK (michelin_stars >= 1 AND michelin_stars <= 3),
  michelin_designation TEXT CHECK (michelin_designation IN ('star', 'bib_gourmand', 'green_star')),
  is_featured BOOLEAN DEFAULT FALSE
)

-- Tips (community submissions)
tips (
  id UUID PRIMARY KEY,
  neighborhood_id TEXT REFERENCES neighborhoods(id),
  content TEXT NOT NULL,
  category TEXT,
  submitter_name TEXT,           -- Optional
  submitter_email TEXT,          -- Optional
  submitter_phone TEXT,          -- Optional
  is_anonymous BOOLEAN DEFAULT FALSE,
  status TEXT CHECK (status IN ('pending', 'reviewed', 'published', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

### Advertising Tables

```sql
-- Ads
ads (
  id UUID PRIMARY KEY,
  advertiser_id UUID REFERENCES profiles(id),
  image_url TEXT NOT NULL,
  headline TEXT NOT NULL,
  click_url TEXT NOT NULL,
  is_global BOOLEAN DEFAULT FALSE,
  neighborhood_id TEXT REFERENCES neighborhoods(id),
  sponsor_label TEXT DEFAULT 'SPONSORED',
  status TEXT CHECK (status IN ('pending', 'approved', 'active', 'paused', 'expired')),
  start_date DATE,
  end_date DATE,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0
)

-- Ad Packages
ad_packages (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  duration_days INTEGER NOT NULL,
  is_global BOOLEAN DEFAULT FALSE,
  max_neighborhoods INTEGER DEFAULT 1,
  active BOOLEAN DEFAULT TRUE
)

-- Ad Orders
ad_orders (
  id UUID PRIMARY KEY,
  advertiser_id UUID REFERENCES profiles(id),
  ad_id UUID REFERENCES ads(id),
  package_id UUID REFERENCES ad_packages(id),
  stripe_payment_intent_id TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  paid_at TIMESTAMPTZ
)
```

---

## Authentication & Authorization

### User Roles

| Role | Permissions |
|------|-------------|
| `reader` | Browse content, save neighborhoods, submit tips |
| `advertiser` | Create ads, view performance, make payments |
| `admin` | Full access, manage Michelin ratings, approve content |

### Auth Flow

1. Sign up via email/password (Supabase Auth)
2. Profile created automatically via database trigger
3. Role defaults to `reader`
4. Advertisers upgrade via dashboard

---

## URL Structure

### Public Pages

```
/                               # Homepage with neighborhood selector
/feed                           # Multi-neighborhood feed
/feed?neighborhoods=id1,id2     # Filtered feed
/feed?section=dining            # Section-filtered feed
/search                         # Global search
/legal                          # Privacy Policy & Terms of Service
/contact                        # Contact page with tip submission
/advertise                      # Advertising information
```

### Neighborhood Pages

```
/[city]/[neighborhood]          # Neighborhood feed
/[city]/[neighborhood]/guides   # Curated guide listings
/[city]/[neighborhood]/map      # Interactive map view
/[city]/[neighborhood]/tonight  # Today's events
/[city]/[neighborhood]/spotted  # Local sightings
/[city]/[neighborhood]/property-watch  # Real estate
```

### Portals

```
/login                          # Sign in
/signup                         # Sign up
/advertiser                     # Advertiser dashboard
/advertiser/ads                 # Manage ads
/advertiser/ads/new             # Create ad
/admin/ads                      # Admin ad management
/admin/guides/michelin          # Michelin ratings management
```

---

## API Routes

```
/api/auth/callback              # Supabase auth callback
/api/auth/signout               # Server-side sign out
/api/guides                     # Guide listings (GET)
/api/tips                       # Tip submission (POST)
/api/stripe/checkout            # Create Stripe checkout
/api/stripe/webhook             # Stripe webhooks
/api/ads/[id]/impression        # Track impression
/api/ads/[id]/click             # Track click
```

---

## Key Components

### Layout Components

- `Header` - Navigation with neighborhood selector, search, auth
- `Footer` - Links to Advertise, Careers, Contact, Legal
- `NeighborhoodHeader` - Neighborhood page header with sub-navigation

### Neighborhood Selector

- `NeighborhoodSelectorModal` - Global modal for selecting neighborhoods
- `EnhancedNeighborhoodSelector` - Full selector with city cards, search, regions
- Uses `useNeighborhoodModal` hook for global state

### Feed Components

- `FeedItem` - Article card in feed
- `AdCard` - Sponsored content card
- `MichelinBadge` - Michelin rating display

### Tips System

- `TipSubmitButton` - Button variants for different contexts
- `TipSubmitModal` - Submission form with categories

---

## Data Flow

### Neighborhood Preferences

1. Anonymous users: Stored in `localStorage` (`flaneur-neighborhood-preferences`)
2. Logged-in users: Synced to `user_neighborhood_preferences` table
3. On login: Local preferences merged with database preferences

### Guide Listings

1. Fetched via `/api/guides?neighborhoodId=xxx`
2. Filtered to 4.0+ Google rating by default
3. Optional Michelin filter via `?michelinOnly=true`
4. Grouped by category for display

---

## Migrations

Located in `supabase/migrations/`:

| Migration | Description |
|-----------|-------------|
| 001-021 | Core schema, articles, ads, sections |
| 022 | Michelin ratings fields |

Run migrations:
```bash
npx supabase db push
```

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# App
NEXT_PUBLIC_APP_URL=https://readflaneur.com
```
