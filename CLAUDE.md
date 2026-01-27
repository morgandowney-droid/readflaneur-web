# Flâneur Web - Project Status

> **How to use:** When starting a new Claude session, say "read CLAUDE.md and pick up where we left off"
>
> **See also:** `../flaneur/CLAUDE.md` for the full project overview and mobile app details.

## Current Status
**Last Updated:** 2026-01-27

### What's Live
- **Website:** https://readflaneur.com
- **Deployed via:** Vercel
- **GitHub:** https://github.com/morgandowney-droid/readflaneur-web

## Project Structure

```
readflaneur-web/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── [city]/[neighborhood]/  # Dynamic neighborhood pages
│   │   │   ├── page.tsx           # Main feed page
│   │   │   ├── [slug]/page.tsx    # Article detail page
│   │   │   └── guides/page.tsx    # Neighborhood guides
│   │   ├── admin/
│   │   │   ├── articles/          # Article management
│   │   │   ├── comments/          # Comment moderation queue
│   │   │   ├── regenerate-images/ # AI image regeneration
│   │   │   └── generate-content/  # Manual content generation
│   │   ├── advertiser/            # Advertiser dashboard
│   │   │   └── ads/new/           # Create new ad
│   │   ├── advertise/             # Advertising info page
│   │   ├── search/                # Search results page
│   │   └── api/
│   │       ├── comments/          # Comments CRUD + moderation
│   │       ├── guides/            # Neighborhood guides API
│   │       ├── search/            # Article search
│   │       └── revalidate/        # Cache revalidation
│   ├── components/
│   │   ├── admin/
│   │   │   └── PersonaSwitcher.tsx  # View-as persona tool
│   │   ├── comments/
│   │   │   ├── Comments.tsx
│   │   │   └── RecentComments.tsx
│   │   ├── feed/
│   │   │   ├── ArticleCard.tsx
│   │   │   ├── FallbackAd.tsx
│   │   │   ├── StoryOpenAd.tsx
│   │   │   └── LoadMoreButton.tsx
│   │   ├── home/
│   │   │   ├── HomeSignup.tsx        # Neighborhood + newsletter signup
│   │   │   └── TypewriterHeadlines.tsx # Animated headlines
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   └── Footer.tsx
│   │   ├── maps/
│   │   │   └── NeighborhoodMap.tsx   # Leaflet map component
│   │   └── neighborhoods/
│   │       └── NeighborhoodSelector.tsx
│   └── lib/
│       └── supabase/
│           ├── client.ts          # Browser client
│           └── server.ts          # Server client
├── supabase/
│   └── migrations/                # Database migrations
│       ├── 001_add_platform_tables.sql
│       ├── 002_add_ad_review_fields.sql
│       ├── 003_update_ad_pricing.sql
│       ├── 004_comments_system.sql
│       ├── 005_neighborhood_guides.sql
│       ├── 006_images_storage.sql
│       └── 007_neighborhood_preferences.sql
└── public/
```

## Key Features

### Homepage Features
- **Typewriter Headlines** - Animated typing effect showing latest articles
  - Static "latest · Neighborhood" label above typing text
  - Fixed height container prevents button jittering
  - Clickable - navigates to full article
- **Neighborhood Selector** - Chip-style buttons to select neighborhoods
  - Saves to database for logged-in users
  - Saves to localStorage for guests
  - "+ Suggest" option for requesting new neighborhoods
- **Newsletter Signup** - Combined with neighborhood selection
  - Creates user account with magic link
  - Only sends newsletters for selected neighborhoods

### Public Pages
- **Homepage** (`/`) - Typewriter headlines, neighborhood selector, newsletter signup
- **Feed** (`/feed`) - Personalized feed based on selected neighborhoods
- **Neighborhood Feed** (`/[city]/[neighborhood]`) - Article feed with infinite scroll
- **Article Detail** (`/[city]/[neighborhood]/[slug]`) - Full article with comments
- **Neighborhood Guides** (`/[city]/[neighborhood]/guides`) - Curated local venues
- **Search** (`/search`) - Full-text article search
- **Advertise** (`/advertise`) - Advertising info and pricing

### Admin Pages
- `/admin/articles` - Review and manage articles
- `/admin/comments` - Comment moderation queue
- `/admin/regenerate-images` - Regenerate AI images for articles
- `/admin/generate-content` - Manually trigger scraping/generation

### Advertiser Pages
- `/advertiser` - Dashboard showing active ads
- `/advertiser/ads/new` - Create and purchase new ad

## Components

### TypewriterHeadlines
- Animated typing effect for latest article headlines
- Static "latest · Neighborhood" label (neighborhood in grey)
- Fixed height (`h-20`) prevents button jittering below
- Click to navigate to article (uses article ID if slug is null)
- URL format: `/{city}/{neighborhood}/{article-id}`

### HomeSignup
- Combined neighborhood selector + newsletter signup
- Chip-style neighborhood buttons (centered)
- Saves preferences to:
  - `user_neighborhood_preferences` table (logged-in users)
  - `localStorage` (guests, key: `flaneur-neighborhood-preferences`)
- Redirects to `/feed` after successful subscription

### PersonaSwitcher
- Activate: `Ctrl+Shift+A`
- Floating button (bottom right)
- Personas: Admin, New Visitor, Subscriber, Advertiser
- Stores state in localStorage

### NeighborhoodMap
- Uses Leaflet with dynamic import (SSR-safe)
- Shows core neighborhood + hinterland boundaries
- CartoDB Positron tiles

### Comments
- Nested replies (3 levels max)
- Upvote/downvote
- AI moderation via OpenAI
- Rate limiting (5/hour per IP)

## URL Routing

### Article URLs
Format: `/{city-slug}/{neighborhood-slug}/{article-slug-or-id}`

City prefix mapping (in `[slug]/page.tsx`):
- `new-york` → `nyc`
- `san-francisco` → `sf`
- `london` → `london`
- `sydney` → `sydney`

Example: `/new-york/west-village/5cf1eaf0-b9bd-4c11-b817-19925f06a9f8`

The article page looks up by both `slug` and `id` to support articles without slugs.

## Database Tables

### user_neighborhood_preferences
- `user_id` (uuid, FK to auth.users)
- `neighborhood_id` (text, FK to neighborhoods)
- Primary key: (user_id, neighborhood_id)
- RLS: Users can only manage their own preferences

### newsletter_subscribers
- Has `neighborhood_ids` array column for newsletter targeting

## Environment Variables (Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
OPENAI_API_KEY=
RESEND_API_KEY=
EMAIL_FROM=
ADMIN_EMAIL=
NEXT_PUBLIC_APP_URL=https://readflaneur.com
```

## Deployment

Deploy to Vercel:
```bash
cd C:\Users\morga\Desktop\readflaneur-web
vercel --prod
```

## Known Quirks

### Supabase Query Limitations
- Complex queries with joins can silently fail and return `null`
- The homepage headlines query must be simple: `select('id, headline, slug, neighborhood_id')`
- Adding `neighborhoods(name, slug, city)` to the query breaks it
- Workaround: Fetch neighborhoods separately and build a lookup map

### Image Configuration
- Supabase storage images require hostname in `next.config.ts`:
  ```typescript
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'ujpdhueytlfqkwzvqetd.supabase.co' },
    ],
  }
  ```

### Article Slugs
- Many articles have `slug: null` in the database
- The article page handles this by looking up via `slug` OR `id`
- Homepage uses article ID as fallback when building URLs

## Related Project

The backend API and mobile app are in `../flaneur/`:
- News scraping
- AI article generation
- AI image generation
- Cron jobs

See `../flaneur/CLAUDE.md` for full details.
