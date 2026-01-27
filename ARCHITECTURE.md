# Flâneur Platform Architecture

## Overview

A hyper-local news platform with three user types:
- **Readers** - Browse neighborhood-based articles and ads
- **Advertisers** - Submit, pay for, and manage ads
- **Journalists/Stringers** - Create and manage content

## Tech Stack

| Component | Technology |
|-----------|------------|
| Website | Next.js 14+ (App Router) |
| Mobile App | Expo / React Native |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Payments | Stripe |
| Storage | Supabase Storage (images) |
| Hosting | Vercel (website) |

---

## Database Schema

### Existing Tables (from MVP)

```sql
-- Neighborhoods
neighborhoods (
  id TEXT PRIMARY KEY,           -- e.g., 'nyc-west-village'
  name TEXT NOT NULL,            -- e.g., 'West Village'
  city TEXT NOT NULL,            -- e.g., 'New York'
  timezone TEXT NOT NULL         -- e.g., 'America/New_York'
)

-- Articles
articles (
  id UUID PRIMARY KEY,
  neighborhood_id TEXT REFERENCES neighborhoods(id),
  headline TEXT NOT NULL,
  body_text TEXT NOT NULL,
  image_url TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
)

-- Ads
ads (
  id UUID PRIMARY KEY,
  image_url TEXT NOT NULL,
  headline TEXT NOT NULL,
  click_url TEXT NOT NULL,
  is_global BOOLEAN DEFAULT FALSE,
  neighborhood_id TEXT REFERENCES neighborhoods(id),
  sponsor_label TEXT DEFAULT 'SPONSORED'
)
```

### New Tables

```sql
-- User Profiles (extends Supabase Auth)
profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('reader', 'journalist', 'advertiser', 'admin')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- Journalist assignments to neighborhoods
journalist_neighborhoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journalist_id UUID REFERENCES profiles(id),
  neighborhood_id TEXT REFERENCES neighborhoods(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(journalist_id, neighborhood_id)
)

-- Articles (updated)
articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  neighborhood_id TEXT REFERENCES neighborhoods(id),
  author_id UUID REFERENCES profiles(id),      -- NEW
  headline TEXT NOT NULL,
  slug TEXT UNIQUE,                             -- NEW: for SEO URLs
  body_text TEXT NOT NULL,
  image_url TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published', 'archived')), -- NEW
  published_at TIMESTAMPTZ,                     -- NEW
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- Ads (updated)
ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID REFERENCES profiles(id),  -- NEW
  image_url TEXT NOT NULL,
  headline TEXT NOT NULL,
  click_url TEXT NOT NULL,
  is_global BOOLEAN DEFAULT FALSE,
  neighborhood_id TEXT REFERENCES neighborhoods(id),
  sponsor_label TEXT DEFAULT 'SPONSORED',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'active', 'paused', 'expired')), -- NEW
  start_date DATE,                              -- NEW
  end_date DATE,                                -- NEW
  impressions INTEGER DEFAULT 0,               -- NEW
  clicks INTEGER DEFAULT 0,                    -- NEW
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Ad Packages / Pricing
ad_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                          -- e.g., 'Weekly Local', 'Monthly Global'
  description TEXT,
  price_cents INTEGER NOT NULL,                -- Price in cents
  duration_days INTEGER NOT NULL,              -- How long the ad runs
  is_global BOOLEAN DEFAULT FALSE,             -- Global or neighborhood-specific
  max_neighborhoods INTEGER DEFAULT 1,         -- How many neighborhoods included
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Ad Orders / Purchases
ad_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID REFERENCES profiles(id),
  ad_id UUID REFERENCES ads(id),
  package_id UUID REFERENCES ad_packages(id),
  stripe_payment_intent_id TEXT,
  stripe_session_id TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Analytics / Impressions tracking
ad_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID REFERENCES ads(id),
  event_type TEXT CHECK (event_type IN ('impression', 'click')),
  user_agent TEXT,
  ip_hash TEXT,                                -- Hashed for privacy
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

---

## Authentication & Authorization

### User Roles

| Role | Permissions |
|------|-------------|
| `reader` | Browse articles, save neighborhoods |
| `journalist` | Create/edit articles in assigned neighborhoods |
| `advertiser` | Create ads, view own ad performance, make payments |
| `admin` | Full access, approve ads, manage users |

### Auth Flow

1. **Sign Up** - Email/password via Supabase Auth
2. **Role Selection** - After signup, user selects role (reader default, journalist/advertiser require approval)
3. **Profile Creation** - Trigger creates profile row with role

### Row Level Security (RLS)

```sql
-- Articles: anyone can read published, authors can edit own
CREATE POLICY "Public can read published articles"
  ON articles FOR SELECT
  USING (status = 'published');

CREATE POLICY "Journalists can manage own articles"
  ON articles FOR ALL
  USING (auth.uid() = author_id);

-- Ads: only show active to public, advertisers manage own
CREATE POLICY "Public can read active ads"
  ON ads FOR SELECT
  USING (status = 'active');

CREATE POLICY "Advertisers can manage own ads"
  ON ads FOR ALL
  USING (auth.uid() = advertiser_id);
```

---

## Stripe Integration

### Payment Flow for Advertisers

1. Advertiser creates ad (draft)
2. Selects package (e.g., "Weekly - West Village - $50")
3. Clicks "Pay & Submit"
4. Redirected to Stripe Checkout
5. On success:
   - Webhook updates ad_orders.status = 'paid'
   - Ad status changes to 'pending' (awaiting approval) or 'active'
   - Start/end dates calculated from package duration
6. On failure:
   - User returned to payment page
   - Order marked as 'failed'

### Stripe Setup

```
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Webhook Events to Handle

- `checkout.session.completed` - Mark order paid, activate ad
- `payment_intent.payment_failed` - Mark order failed
- `charge.refunded` - Handle refunds

---

## URL Structure

### Public (Reader)

```
/                           # Landing page
/neighborhoods              # Browse all neighborhoods
/[city]/[neighborhood]      # Feed for specific neighborhood (e.g., /new-york/west-village)
/[city]/[neighborhood]/[slug] # Individual article
/login                      # Sign in
/signup                     # Sign up
```

### Advertiser Portal

```
/advertiser                 # Dashboard
/advertiser/ads             # List of my ads
/advertiser/ads/new         # Create new ad
/advertiser/ads/[id]        # Edit ad
/advertiser/rates           # View packages & pricing
/advertiser/checkout/[pkg]  # Stripe checkout
/advertiser/orders          # Payment history
```

### Journalist Portal

```
/journalist                 # Dashboard
/journalist/articles        # My articles
/journalist/articles/new    # Create article
/journalist/articles/[id]   # Edit article
```

### Admin

```
/admin                      # Dashboard
/admin/articles             # Review/approve articles
/admin/ads                  # Review/approve ads
/admin/users                # Manage users
/admin/neighborhoods        # Manage neighborhoods
```

---

## API Routes (Next.js)

```
/api/auth/callback          # Supabase auth callback
/api/stripe/checkout        # Create Stripe checkout session
/api/stripe/webhook         # Handle Stripe webhooks
/api/ads/[id]/impression    # Track ad impression
/api/ads/[id]/click         # Track ad click
```

---

## File Structure

```
readflaneur/
├── src/
│   ├── app/
│   │   ├── (public)/                    # Reader-facing pages
│   │   │   ├── page.tsx                 # Landing
│   │   │   ├── neighborhoods/
│   │   │   ├── [city]/[neighborhood]/
│   │   │   └── login, signup
│   │   ├── (dashboard)/                 # Protected portals
│   │   │   ├── advertiser/
│   │   │   ├── journalist/
│   │   │   └── admin/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   └── stripe/
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                          # Shared UI components
│   │   ├── feed/                        # Article cards, ad cards
│   │   ├── forms/                       # Article editor, ad creator
│   │   └── layout/                      # Header, footer, nav
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                # Browser client
│   │   │   ├── server.ts                # Server client
│   │   │   └── middleware.ts            # Auth middleware
│   │   ├── stripe.ts
│   │   └── utils.ts
│   └── types/
│       └── index.ts
├── supabase/
│   └── migrations/                      # Schema migrations
└── public/
```

---

## Implementation Phases

### Phase 1: Reader Website (Week 1-2)
- [ ] Landing page with neighborhood grid
- [ ] Neighborhood feed page (articles + ads)
- [ ] Individual article page
- [ ] Mobile-responsive design
- [ ] Connect to existing Supabase data

### Phase 2: Authentication (Week 2-3)
- [ ] Supabase Auth setup
- [ ] Login/signup pages
- [ ] Profile creation with roles
- [ ] Protected route middleware

### Phase 3: Journalist Portal (Week 3-4)
- [ ] Article creation form with rich text
- [ ] Image upload to Supabase Storage
- [ ] Draft/publish workflow
- [ ] My articles list

### Phase 4: Advertiser Portal (Week 4-5)
- [ ] Ad creation form
- [ ] Package selection & pricing display
- [ ] Stripe Checkout integration
- [ ] Ad performance dashboard

### Phase 5: Admin & Polish (Week 5-6)
- [ ] Admin dashboard
- [ ] Content moderation
- [ ] Analytics
- [ ] SEO optimization

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
