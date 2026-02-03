# Flâneur

A luxury hyper-local news and neighborhood guide platform. Flâneur delivers curated content for discerning readers who want to discover the best of their neighborhoods across global cities.

## Features

- **Neighborhood Feeds** - Curated articles and stories for 99 neighborhoods across 23 cities globally (including 8 vacation destinations)
- **Neighborhood Guides** - Curated listings with Google ratings (4.0+) and Michelin designations
- **Tonight** - What's happening in your neighborhood today
- **Spotted** - Local sightings and happenings
- **Property Watch** - Real estate updates for your area
- **Multi-Neighborhood Selection** - Follow multiple neighborhoods for a personalized feed
- **Tip Submission** - Community-sourced news tips with optional anonymity
- **Advertiser Portal** - Self-service advertising with Stripe payments

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 16+ (App Router) |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Payments | Stripe |
| Storage | Supabase Storage |
| Hosting | Vercel |

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Stripe account (for payments)

### Environment Variables

Create a `.env.local` file:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Stripe
STRIPE_SECRET_KEY=sk_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run database migrations
npx supabase db push
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── [city]/[neighborhood]/  # Neighborhood pages
│   │   ├── guides/         # Neighborhood guide listings
│   │   ├── map/            # Interactive map view
│   │   ├── tonight/        # Events happening today
│   │   ├── spotted/        # Local sightings
│   │   └── property-watch/ # Real estate listings
│   ├── admin/              # Admin dashboard
│   │   ├── ads/            # Ad management
│   │   └── guides/michelin/# Michelin ratings admin
│   ├── advertiser/         # Advertiser portal
│   ├── api/                # API routes
│   ├── feed/               # Multi-neighborhood feed
│   ├── legal/              # Privacy & Terms
│   └── search/             # Global search
├── components/
│   ├── feed/               # Feed components
│   ├── home/               # Homepage components
│   ├── layout/             # Header, Footer
│   ├── neighborhoods/      # Neighborhood selector
│   └── tips/               # Tip submission
├── lib/
│   ├── supabase/           # Database clients
│   └── utils.ts            # Utility functions
└── types/                  # TypeScript definitions

supabase/
└── migrations/             # Database migrations
```

## Key Features

### Michelin Ratings

Restaurants can be tagged with Michelin designations:
- **Stars** (1-3): Michelin star ratings
- **Bib Gourmand**: Quality food at moderate prices
- **Green Star**: Sustainable gastronomy

Managed via `/admin/guides/michelin`.

### Neighborhood Selection

Users can select multiple neighborhoods to follow. Preferences are:
- Stored in `localStorage` for anonymous users
- Synced to `user_neighborhood_preferences` table for logged-in users

### Guide Listings

Curated places filtered to 4.0+ Google ratings with optional Michelin filter. Categories include dining, cafes, bars, shopping, and more.

## Documentation

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed technical documentation.

## License

Proprietary - All rights reserved.
