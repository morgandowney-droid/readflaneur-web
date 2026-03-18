import { createSwaggerSpec } from 'next-swagger-doc';

export function getApiDocs() {
  const spec = createSwaggerSpec({
    apiFolder: 'src/app/api',
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Flaneur API',
        version: '1.0.0',
        description:
          'API for readflaneur.com — neighborhood news, daily briefs, exploration, and more.',
        contact: {
          name: 'Flaneur',
          url: 'https://readflaneur.com',
          email: 'contact@readflaneur.com',
        },
      },
      servers: [
        {
          url: 'https://readflaneur.com',
          description: 'Production',
        },
        {
          url: 'http://localhost:3000',
          description: 'Local development',
        },
      ],
      tags: [
        { name: 'Auth', description: 'Authentication and session management' },
        { name: 'Neighborhoods', description: 'Neighborhood data and user preferences' },
        { name: 'Feed', description: 'Feed content and discovery briefs' },
        { name: 'Briefs', description: 'Daily briefs and Look Ahead articles' },
        { name: 'Articles', description: 'Article content and views' },
        { name: 'Search', description: 'Full-text article search' },
        { name: 'Reactions', description: 'Article bookmarks and hearts' },
        { name: 'Image Feedback', description: 'Image quality voting' },
        { name: 'Lists', description: 'Destination wishlists and favorites' },
        { name: 'Explore', description: 'Multi-level neighborhood exploration' },
        { name: 'Newsletter', description: 'Newsletter subscription' },
        { name: 'Referral', description: 'Referral codes and tracking' },
        { name: 'Email', description: 'Email preferences and unsubscribe' },
        { name: 'Location', description: 'IP detection and primary neighborhood' },
        { name: 'Preferences', description: 'User theme, language, and timezone' },
        { name: 'Ads', description: 'Advertising booking and management' },
        { name: 'Comments', description: 'Article comments and voting' },
        { name: 'Translations', description: 'Article and brief translations' },
        { name: 'Guides', description: 'Neighborhood guide content' },
        { name: 'Community', description: 'Community neighborhood creation and management' },
        { name: 'Admin', description: 'Admin-only endpoints' },
        { name: 'Cron', description: 'Scheduled cron jobs (Vercel-triggered)' },
        { name: 'Internal', description: 'Internal service endpoints' },
      ],
      components: {
        securitySchemes: {
          supabaseAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'sb-access-token',
            description: 'Supabase session cookie (set automatically on login)',
          },
          cronSecret: {
            type: 'apiKey',
            in: 'header',
            name: 'x-vercel-cron',
            description: 'Vercel cron secret or CRON_SECRET header',
          },
        },
        schemas: {
          Error: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
            required: ['error'],
          },
          Neighborhood: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'nyc-tribeca' },
              name: { type: 'string', example: 'Tribeca' },
              city: { type: 'string', example: 'New York' },
              country: { type: 'string', example: 'United States' },
              region: { type: 'string', example: 'north_america' },
              latitude: { type: 'number', example: 40.7163 },
              longitude: { type: 'number', example: -74.0086 },
              timezone: { type: 'string', example: 'America/New_York' },
              is_combo: { type: 'boolean' },
              is_community: { type: 'boolean' },
              is_active: { type: 'boolean' },
            },
          },
          ArticleSummary: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              headline: { type: 'string' },
              excerpt: { type: 'string' },
              image_url: { type: 'string', nullable: true },
              url: { type: 'string' },
              neighborhood: { type: 'string', nullable: true },
              city: { type: 'string', nullable: true },
              published_at: { type: 'string', format: 'date-time' },
            },
          },
          ReactionCounts: {
            type: 'object',
            properties: {
              bookmark: { type: 'integer' },
              heart: { type: 'integer' },
              fire: { type: 'integer' },
            },
          },
          DestinationList: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string', example: 'My News Feed' },
              slug: { type: 'string' },
              is_default: { type: 'boolean' },
              is_public: { type: 'boolean' },
              share_token: { type: 'string', example: 'a1b2c3d4' },
              created_at: { type: 'string', format: 'date-time' },
              updated_at: { type: 'string', format: 'date-time' },
            },
          },
          ExploreSuggestion: {
            type: 'object',
            nullable: true,
            properties: {
              neighborhoodName: { type: 'string' },
              city: { type: 'string' },
              headline: { type: 'string' },
              teaser: { type: 'string' },
              url: { type: 'string' },
              imageUrl: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  });
  return spec;
}
