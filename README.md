# Flâneur

A luxury hyper-local news and neighborhood guide platform. Flâneur delivers curated content for discerning readers who want to discover the best of their neighborhoods across global cities.

## Features

- **Neighborhood Feeds** - Curated articles and stories for 120 neighborhoods across 33 cities globally (including vacation destinations and combo neighborhoods)
- **Neighborhood Guides** - Curated listings with Google ratings (4.0+) and Michelin designations
- **Tonight** - What's happening in your neighborhood today
- **Spotted** - Local sightings and happenings
- **Property Watch** - Real estate updates for your area
- **NYC Civic Data** - Building permits, liquor licenses, and crime stats from NYC Open Data (11 NYC neighborhoods)
- **Filming Location Watch** - "Set Life" alerts for upcoming TV/film shoots in NYC neighborhoods
- **Alfresco Watch** - "Al Fresco Alert" for new outdoor dining setups in NYC neighborhoods
- **Heritage Watch** - Preservation alerts for demolitions, landmark changes, and tree removal in NYC
- **Global Civic Data** - International permits, licenses, and safety stats from London, Sydney, Chicago, LA, Washington DC, Dublin, Auckland, and Queenstown
- **OIO Bunker Watch** - New Zealand Overseas Investment Office monitoring for foreign billionaire land acquisitions
- **Auction Watch** - Blue Chip auction calendar syndication to the Northeast Luxury Corridor (25+ neighborhoods)
- **Global Auction Watch** - Hub & Spoke model for international art hubs (London, Paris, Hong Kong, LA, Geneva)
- **Art Fair Coverage** - Calendar-based coverage for Big 5 global fairs with Preview/Live/Wrap states
- **Retail Watch** - Luxury store opening detection via signage permits (80+ brand patterns)
- **Nuisance Watch** - 311 complaint hotspot detection with cluster/spike analysis
- **Specialty Auctions** - Regional auction houses (20+) and vacation market mappings (10+)
- **Gala Watch** - High-society charity events via Hub Broadcast model (10 global hubs)
- **Escape Index** - Vacation conditions (Snow/Surf/Sun) injected into feeder city feeds
- **Review Watch** - Restaurant reviews from major publications (NYT, Infatuation, Eater, Guardian)
- **Sample Sale Alerts** - Luxury sample sales from fashion aggregators (Chicmi, 260, Arlettie) with 70+ brand whitelist
- **NIMBY Alerts** - Community board agenda monitoring for controversial votes (liquor licenses, zoning changes)
- **Political Wallet** - Donation trend monitoring showing "where the neighborhood is betting" (FEC/UK Electoral data)
- **Fashion Week Coverage** - Big Four fashion week alerts (NYFW, LFW, MFW, PFW) with traffic warnings and show schedules
- **Archive Hunter** - Luxury resale inventory alerts from TheRealReal, WGACA, Rebag, Fashionphile ($3k+ items)
- **Residency Radar** - "Scene Watch" alerts for luxury brand seasonal pop-ups (Nobu/Carbone in Hamptons, Dior in Mykonos)
- **Route Alerts** - "Flight Check" alerts for new direct premium routes from local hubs (JFK-Nice, LHR-Phuket, etc.)
- **Museum Watch** - "Culture Watch" alerts for blockbuster exhibitions at Tier 1 museums (Met, MoMA, Tate, Louvre, etc.)
- **Overture Alerts** - "Curtain Up" alerts for Opening Nights at premiere opera houses (Met Opera, ROH, La Scala, etc.)
- **Design Week Coverage** - Calendar-driven coverage for global design weeks (Salone del Mobile, LDF, Design Miami, etc.)
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
│   ├── gemini-story-registry.ts  # Registry of 24 Gemini story generators
│   ├── hyperlink-injector.ts     # Hyperlink injection for Gemini stories
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

### RSS News Aggregation

Local news from RSS feeds is aggregated, filtered, and rewritten by Claude AI:
- Articles labeled with `category_label: 'News Brief'`
- Source attribution preserved in `editor_notes`
- Filtered by Source type in `/admin/news-feed`

### AI Standards Compliance

Per `/standards` (AI Ethics Policy):
- AI-generated content clearly labeled
- Images use stylized artistic renderings (not photorealistic)
- Source attribution for all RSS-sourced content
- C2PA metadata for content provenance

## Documentation

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed technical documentation.

## License

Proprietary - All rights reserved.
