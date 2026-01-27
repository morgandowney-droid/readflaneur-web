# Flâneur Web - Project Status

> **How to use:** When starting a new Claude session, say "read CLAUDE.md and pick up where we left off"
>
> **See also:** `../flaneur/CLAUDE.md` for the full project overview and mobile app details.

## Current Status
**Last Updated:** 2026-01-26 11:30pm

### What's Live
- **Website:** https://readflaneur.com
- **Deployed via:** Vercel

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
│   │   │   └── PersonaSwitcher.tsx # View-as persona tool
│   │   ├── comments/
│   │   │   ├── CommentSection.tsx
│   │   │   └── CommentForm.tsx
│   │   ├── feed/
│   │   │   ├── ArticleCard.tsx
│   │   │   └── LoadMoreButton.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   └── Footer.tsx
│   │   └── maps/
│   │       └── NeighborhoodMap.tsx # Leaflet map component
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
│       └── 006_images_storage.sql
└── public/
```

## Key Features

### Public Pages
- **Homepage** (`/`) - Neighborhood selector, recent articles, recent comments
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

### PersonaSwitcher
- Activate: `Ctrl+Shift+A`
- Floating button (bottom right)
- Personas: Admin, New Visitor, Subscriber, Advertiser
- Stores state in localStorage

### NeighborhoodMap
- Uses Leaflet with dynamic import (SSR-safe)
- Shows core neighborhood + hinterland boundaries
- CartoDB Positron tiles

### CommentSection
- Nested replies (3 levels max)
- Upvote/downvote
- AI moderation via OpenAI
- Rate limiting (5/hour per IP)

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

## Related Project

The backend API and mobile app are in `../flaneur/`:
- News scraping
- AI article generation
- AI image generation
- Cron jobs

See `../flaneur/CLAUDE.md` for full details.
