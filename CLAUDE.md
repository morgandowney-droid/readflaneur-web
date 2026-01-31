# Flâneur Web - Project Status

> **How to use:** When starting a new Claude session, say "read CLAUDE.md and pick up where we left off"
>
> **See also:** `../flaneur/CLAUDE.md` for the full project overview and mobile app details.

## Current Status
**Last Updated:** 2026-01-31

### Recent Changes (2026-01-31)

**Google OAuth Now Live:**
- Google login working at https://readflaneur.com/login
- OAuth configured in Supabase + Google Cloud Console
- Users can sign in/up with Google

**Vercel Pro Activated:**
- Upgraded from Hobby to Pro ($20/mo)
- 30-minute cron intervals now supported
- Deployed to production

**Content Pipeline Running:**
- ~15 new articles generated via AI
- Sydney Paddington: 44 sources → ~5 articles
- Stockholm Östermalm: 18 sources → ~8 articles
- Backend API fully configured with env vars

### Previous Changes (2026-01-30)

**Google & Apple OAuth Login:**
- Added social login buttons to `/login` and `/signup` pages
- OAuth callback handler at `/api/auth/callback`
- Files: `src/app/login/page.tsx`, `src/app/signup/page.tsx`, `src/app/api/auth/callback/route.ts`

**Luxury Ads Added:**
- 15 new premium ads: NetJets, Half Moon, JPM Private Bank, Cartier, Bentley, Soho House, La Mer, Sotheby's, Patek Philippe, Blade, RH, Singita, White Cube, Savills, Sotheby's Realty
- Mix of global and neighborhood-specific targeting
- Migration: `flaneur/supabase/migrations/017_luxury_ads.sql`

**Engagement Features - Tonight, Spotted, Property Watch:**

1. **Tonight Picks** (`/[city]/[neighborhood]/tonight`)
   - Curated daily events
   - Date selector (Today, Tomorrow, Weekend)
   - AI-scored events with Flâneur voice
   - Tables: `tonight_picks`, `tonight_sources`

2. **Spotted** (`/[city]/[neighborhood]/spotted`)
   - Real-time neighborhood sightings from social media
   - Categories: restaurant_crowd, construction, celebrity, new_business, closure, traffic, event
   - Sources: Reddit, Google Reviews (Twitter skipped - $200/mo)
   - Real-time Supabase subscription
   - Tables: `spotted_items`, `spotted_clusters`, `spotted_monitors`

3. **Property Watch** (`/[city]/[neighborhood]/property-watch`)
   - Crowdsourced property sightings (works globally)
   - Tabs: All Activity, For Sale/Rent, Storefronts, Development
   - Multi-currency support ($, £, kr, AUD)
   - User submission form
   - Tables: `property_sightings`, `storefront_changes`, `development_projects`, `neighborhood_property_config`, `property_watch_digests`

**Sections & User Interests System:**
- 10 content sections: Art, Fashion, Real Estate, Travel, Food, Wellness, Cars, Schools, Money, Kids
- AI auto-tags articles with sections
- Users can select interests for personalized feed
- Ad targeting by section
- Tables: `sections`, `article_sections`, `user_section_interests`, `ad_sections`

### What's Live
- **Website:** https://readflaneur.com
- **Backend API:** https://flaneur-azure.vercel.app
- **GitHub:** https://github.com/morgandowney-droid/readflaneur-web
- **Google OAuth:** Working

## Project Structure

```
readflaneur-web/
├── src/
│   ├── app/
│   │   ├── [city]/[neighborhood]/
│   │   │   ├── page.tsx              # Main feed
│   │   │   ├── [slug]/page.tsx       # Article detail
│   │   │   ├── guides/page.tsx       # Neighborhood guides
│   │   │   ├── tonight/page.tsx      # Tonight picks
│   │   │   ├── spotted/page.tsx      # Spotted sightings
│   │   │   └── property-watch/page.tsx # Property tracking
│   │   ├── admin/
│   │   │   ├── articles/
│   │   │   ├── comments/
│   │   │   ├── tips/
│   │   │   ├── sections/page.tsx     # Section management
│   │   │   ├── regenerate-images/
│   │   │   └── generate-content/
│   │   ├── login/page.tsx            # Login with OAuth
│   │   ├── signup/page.tsx           # Signup with OAuth
│   │   ├── feed/page.tsx             # Personalized feed
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── callback/route.ts # OAuth callback
│   │       │   ├── session/route.ts
│   │       │   └── signout/route.ts
│   │       ├── cron/
│   │       │   ├── sync-guides/route.ts
│   │       │   ├── sync-tonight/route.ts
│   │       │   ├── sync-spotted/route.ts
│   │       │   ├── process-property-watch/route.ts
│   │       │   ├── generate-digests/route.ts
│   │       │   └── publish-scheduled/route.ts
│   │       ├── stripe/
│   │       │   ├── checkout/route.ts
│   │       │   └── webhook/route.ts
│   │       └── ...
│   ├── components/
│   │   ├── feed/
│   │   │   ├── NeighborhoodHeader.tsx  # Nav links to Tonight/Spotted/Property
│   │   │   └── ...
│   │   ├── sections/
│   │   │   └── SectionInterestSelector.tsx
│   │   └── ...
│   └── lib/
│       ├── supabase/
│       ├── ad-engine.ts              # Section-based ad targeting
│       ├── google-places.ts          # Places API + photos
│       ├── event-sources.ts          # Event fetching
│       └── social-sources.ts         # Social media monitoring
├── supabase/
│   └── migrations/
│       ├── 012_guide_photos_and_services.sql
│       └── ...
└── vercel.json                       # Cron schedules
```

## Environment Variables

### Required
```
NEXT_PUBLIC_SUPABASE_URL=https://ujpdhueytlfqkwzvqetd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=               # AI summaries for crons
GOOGLE_PLACES_API_KEY=           # Guides, reviews, photos
CRON_SECRET=
```

### Payments & Email
```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
RESEND_API_KEY=
EMAIL_FROM=hello@readflaneur.com
ADMIN_EMAIL=
NEXT_PUBLIC_APP_URL=https://readflaneur.com
```

### Optional
```
OPENAI_API_KEY=                  # Content moderation
EVENTBRITE_API_KEY=              # Events (API deprecated)
TWITTER_BEARER_TOKEN=            # Spotted tweets ($200/mo)
```

## Automated Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| sync-guides | Daily 3 AM UTC | Sync Google Places data |
| sync-tonight | Daily 2 PM UTC | Fetch & curate events |
| sync-spotted | Every 30 min | Monitor social media |
| process-property-watch | Daily 7 AM UTC | Process user submissions |
| generate-digests | Weekly Mon 8 AM UTC | Weekly property summaries |

## Database Tables

### Engagement Features
- `tonight_picks` - Curated events
- `tonight_sources` - Event source tracking
- `spotted_items` - Social media sightings
- `spotted_clusters` - Related sighting grouping
- `spotted_monitors` - Social media monitor config
- `property_sightings` - For sale/rent/construction sightings
- `storefront_changes` - Business openings/closings
- `development_projects` - Construction tracking
- `neighborhood_property_config` - Currency, API availability per neighborhood
- `property_watch_digests` - Weekly summaries

### Sections System
- `sections` - Content categories (Art, Food, etc.)
- `article_sections` - Article-to-section mapping with AI confidence
- `user_section_interests` - User preferences
- `ad_sections` - Ad targeting by section

## Completed Setup

- [x] Google OAuth configured and working
- [x] Vercel Pro activated ($20/mo)
- [x] All environment variables set
- [x] Content pipeline tested
- [x] ~15 articles generated

## Pending Setup

1. **Apple OAuth** - Requires Apple Developer account ($99/yr)

## Deployment

```bash
cd C:\Users\morga\Desktop\readflaneur-web
git add . && git commit -m "message" && git push origin master
npx vercel --prod
```

## Related Project

Backend API and mobile app in `../flaneur/` - see `../flaneur/CLAUDE.md`
