// Google Places API (New) integration for fetching real business listings

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// Map our categories to Google Places types (new API format)
// See: https://developers.google.com/maps/documentation/places/web-service/place-types
const CATEGORY_TO_PLACE_TYPES: Record<string, string[]> = {
  'restaurants': ['restaurant', 'american_restaurant', 'italian_restaurant', 'mexican_restaurant', 'japanese_restaurant', 'chinese_restaurant', 'french_restaurant', 'thai_restaurant', 'indian_restaurant', 'mediterranean_restaurant', 'seafood_restaurant', 'steak_house', 'sushi_restaurant', 'vegetarian_restaurant', 'brunch_restaurant'],
  'coffee-cafes': ['cafe', 'coffee_shop', 'bakery', 'breakfast_restaurant'],
  'bars-nightlife': ['bar', 'wine_bar', 'pub', 'beer_hall', 'beer_garden', 'liquor_store'],
  'shopping': ['clothing_store', 'shoe_store', 'jewelry_store', 'book_store', 'home_goods_store', 'gift_shop', 'shopping_mall', 'department_store', 'florist', 'furniture_store'],
  'services': ['hair_salon', 'spa', 'gym', 'beauty_salon', 'barber_shop', 'nail_salon', 'laundry', 'dry_cleaning'],
  'parks-recreation': ['park', 'playground', 'hiking_area', 'sports_club', 'fitness_center', 'dog_park', 'garden'],
  'arts-culture': ['art_gallery', 'museum', 'performing_arts_theater', 'movie_theater', 'cultural_center', 'library', 'concert_hall'],
  'family-kids': ['playground', 'toy_store', 'ice_cream_shop', 'movie_theater', 'library', 'park', 'sports_complex'],
};

// Neighborhood center coordinates for searching
const NEIGHBORHOOD_CENTERS: Record<string, { lat: number; lng: number; radius: number }> = {
  'nyc-west-village': { lat: 40.7336, lng: -74.0027, radius: 800 },
  'london-notting-hill': { lat: 51.5117, lng: -0.2054, radius: 1000 },
  'sf-pacific-heights': { lat: 37.7925, lng: -122.4350, radius: 1000 },
  'stockholm-ostermalm': { lat: 59.3380, lng: 18.0850, radius: 1200 },
  'sydney-paddington': { lat: -33.8847, lng: 151.2265, radius: 1000 },
  // Brooklyn West combo components
  'nyc-dumbo': { lat: 40.7033, lng: -73.9884, radius: 800 },
  'nyc-cobble-hill': { lat: 40.6867, lng: -73.9962, radius: 800 },
  'nyc-park-slope': { lat: 40.6710, lng: -73.9814, radius: 1200 },
  'nyc-brooklyn-west': { lat: 40.6870, lng: -73.9887, radius: 2500 }, // Combo center
  // New York Enclaves - Westchester NY components
  'nyc-rye': { lat: 40.9805, lng: -73.6851, radius: 1500 },
  'nyc-larchmont': { lat: 40.9282, lng: -73.7518, radius: 1200 },
  'nyc-scarsdale': { lat: 40.9888, lng: -73.7846, radius: 1500 },
  'nyc-bronxville': { lat: 40.9382, lng: -73.8320, radius: 1000 },
  'nyc-westchester': { lat: 40.9590, lng: -73.7634, radius: 8000 }, // Combo center
  // New York Enclaves - Gold Coast CT components
  'nyc-darien': { lat: 41.0785, lng: -73.4693, radius: 2000 },
  'nyc-greenwich': { lat: 41.0263, lng: -73.6285, radius: 3000 },
  'nyc-westport': { lat: 41.1415, lng: -73.3579, radius: 2500 },
  'nyc-gold-coast': { lat: 41.0820, lng: -73.4852, radius: 12000 }, // Combo center
  // New York Enclaves - Summit & The Hills NJ
  'nyc-summit': { lat: 40.7157, lng: -74.3646, radius: 1500 },
  'nyc-short-hills': { lat: 40.7479, lng: -74.3254, radius: 1500 },
  'nyc-millburn': { lat: 40.7260, lng: -74.3043, radius: 1200 },
  'nyc-summit-hills': { lat: 40.7299, lng: -74.3314, radius: 5000 }, // Combo center
  // New York Enclaves - Montclair & The Ridge NJ
  'nyc-montclair': { lat: 40.8259, lng: -74.2090, radius: 2000 },
  'nyc-glen-ridge': { lat: 40.8043, lng: -74.2037, radius: 1000 },
  'nyc-montclair-ridge': { lat: 40.8151, lng: -74.2064, radius: 4000 }, // Combo center
  // New York Enclaves - Bergen Gold NJ
  'nyc-alpine': { lat: 40.9557, lng: -73.9313, radius: 1500 },
  'nyc-saddle-river': { lat: 41.0312, lng: -74.1024, radius: 1500 },
  'nyc-englewood-cliffs': { lat: 40.8854, lng: -73.9524, radius: 1200 },
  'nyc-bergen-gold': { lat: 40.9574, lng: -74.0287, radius: 8000 }, // Combo center
  // New York Enclaves - Old Westbury LI NY
  'nyc-old-westbury': { lat: 40.7887, lng: -73.5996, radius: 2000 },
  'nyc-muttontown': { lat: 40.8232, lng: -73.5476, radius: 1500 },
  'nyc-brookville': { lat: 40.8126, lng: -73.5665, radius: 1500 },
  'nyc-old-westbury-li': { lat: 40.8082, lng: -73.5712, radius: 5000 }, // Combo center
  // Stockholm Enclaves - Djursholm & Stocksund
  'stockholm-djursholm': { lat: 59.3975, lng: 18.0875, radius: 2000 },
  'stockholm-stocksund': { lat: 59.3858, lng: 18.0558, radius: 1500 },
  'stockholm-djursholm-stocksund': { lat: 59.3917, lng: 18.0717, radius: 4000 }, // Combo center
  // Stockholm Enclaves - Lidingö Island
  'stockholm-lidingo-town': { lat: 59.3667, lng: 18.1500, radius: 3000 },
  'stockholm-lidingo': { lat: 59.3667, lng: 18.1500, radius: 5000 }, // Combo center
  // Stockholm Enclaves - Saltsjöbaden Coast
  'stockholm-saltsjobaden': { lat: 59.2833, lng: 18.3000, radius: 2000 },
  'stockholm-solsidan': { lat: 59.2917, lng: 18.2833, radius: 1500 },
  'stockholm-saltsjobaden-coast': { lat: 59.2875, lng: 18.2917, radius: 4000 }, // Combo center
  // Stockholm Enclaves - Bromma Trädgårdsstad
  'stockholm-appelviken': { lat: 59.3333, lng: 17.9500, radius: 1200 },
  'stockholm-alsten': { lat: 59.3250, lng: 17.9417, radius: 1000 },
  'stockholm-smedslatten': { lat: 59.3292, lng: 17.9583, radius: 1000 },
  'stockholm-bromma': { lat: 59.3292, lng: 17.9500, radius: 3000 }, // Combo center
};

interface GooglePlaceNew {
  id: string;
  displayName: { text: string; languageCode: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string; // "PRICE_LEVEL_FREE" | "PRICE_LEVEL_INEXPENSIVE" | "PRICE_LEVEL_MODERATE" | "PRICE_LEVEL_EXPENSIVE" | "PRICE_LEVEL_VERY_EXPENSIVE"
  types?: string[];
  businessStatus?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  editorialSummary?: { text: string };
  reviews?: { text: { text: string }; rating: number }[];
  photos?: { name: string; widthPx?: number; heightPx?: number }[];
}

// Get photo URL from Google Places photo reference
export function getPhotoUrl(photoName: string, maxWidth: number = 400): string {
  if (!GOOGLE_PLACES_API_KEY || !photoName) return '';
  // New API format: photos/{photo_reference}/media
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${GOOGLE_PLACES_API_KEY}`;
}

// Calculate distance between two points (Haversine formula)
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

// Convert Google price level to our format
function formatPriceRange(priceLevel?: string): string | null {
  if (!priceLevel) return null;
  const mapping: Record<string, string> = {
    'PRICE_LEVEL_FREE': '$',
    'PRICE_LEVEL_INEXPENSIVE': '$',
    'PRICE_LEVEL_MODERATE': '$$',
    'PRICE_LEVEL_EXPENSIVE': '$$$',
    'PRICE_LEVEL_VERY_EXPENSIVE': '$$$$',
  };
  return mapping[priceLevel] || null;
}

// Generate tags from Google place data
function generateTags(place: GooglePlaceNew): string[] {
  const tags: string[] = [];

  if (place.rating && place.rating >= 4.5) {
    tags.push('highly rated');
  }

  if (place.userRatingCount && place.userRatingCount > 500) {
    tags.push('popular');
  }

  if (place.userRatingCount && place.userRatingCount > 1000) {
    tags.push('local favorite');
  }

  return tags.slice(0, 5);
}

// Search for places in a neighborhood using new API
// Can accept either a neighborhoodId (will use NEIGHBORHOOD_CENTERS) or explicit coordinates
export async function searchPlaces(
  neighborhoodId: string,
  categorySlug: string,
  coordinates?: { lat: number; lng: number; radius: number }
): Promise<GooglePlaceNew[]> {
  if (!GOOGLE_PLACES_API_KEY) {
    console.error('GOOGLE_PLACES_API_KEY not configured');
    return [];
  }

  // Use provided coordinates or fall back to NEIGHBORHOOD_CENTERS
  const center = coordinates || NEIGHBORHOOD_CENTERS[neighborhoodId];
  if (!center) {
    console.error(`No coordinates configured for neighborhood: ${neighborhoodId}`);
    return [];
  }

  const placeTypes = CATEGORY_TO_PLACE_TYPES[categorySlug];
  if (!placeTypes) {
    console.error(`No place types mapped for category: ${categorySlug}`);
    return [];
  }

  const allPlaces: GooglePlaceNew[] = [];
  const seenIds = new Set<string>();

  // Make two API calls with different ranking to get more diverse results
  const rankPreferences = ['POPULARITY', 'DISTANCE'];

  for (const rankPreference of rankPreferences) {
    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.businessStatus,places.websiteUri,places.nationalPhoneNumber,places.editorialSummary,places.photos',
        },
        body: JSON.stringify({
          includedTypes: placeTypes.slice(0, 50), // API allows max 50 types
          maxResultCount: 20,
          locationRestriction: {
            circle: {
              center: {
                latitude: center.lat,
                longitude: center.lng,
              },
              radius: center.radius,
            },
          },
          rankPreference,
        }),
      });

      const data = await response.json();

      if (data.places) {
        // Filter out permanently closed places and deduplicate
        for (const place of data.places) {
          if (place.businessStatus !== 'CLOSED_PERMANENTLY' && !seenIds.has(place.id)) {
            seenIds.add(place.id);
            allPlaces.push(place);
          }
        }
      }

      // Small delay between API calls
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error fetching places for ${categorySlug} (${rankPreference}):`, error);
    }
  }

  // Sort by rating and number of reviews
  return allPlaces.sort((a, b) => {
    const scoreA = (a.rating || 0) * Math.log10((a.userRatingCount || 1) + 1);
    const scoreB = (b.rating || 0) * Math.log10((b.userRatingCount || 1) + 1);
    return scoreB - scoreA;
  });
}

// Get detailed info for a place using new API
export async function getPlaceDetails(placeId: string): Promise<GooglePlaceNew | null> {
  if (!GOOGLE_PLACES_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,priceLevel,editorialSummary,reviews,photos',
      },
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching place details for ${placeId}:`, error);
  }

  return null;
}

// Generate a description from place details
export function generateDescription(place: GooglePlaceNew, details?: GooglePlaceNew | null): string {
  // Use editorial summary if available
  if (details?.editorialSummary?.text) {
    return details.editorialSummary.text;
  }

  if (place.editorialSummary?.text) {
    return place.editorialSummary.text;
  }

  // Use top review excerpt if available
  if (details?.reviews && details.reviews.length > 0) {
    const topReview = details.reviews
      .filter(r => r.rating >= 4)
      .sort((a, b) => b.rating - a.rating)[0];

    if (topReview?.text?.text) {
      const excerpt = topReview.text.text.slice(0, 150);
      return excerpt.endsWith('.') ? excerpt : excerpt + '...';
    }
  }

  // Fallback: generate from rating
  if (place.rating && place.rating >= 4) {
    return `Highly rated local spot with ${place.userRatingCount || 'many'} reviews.`;
  }

  return 'A local neighborhood favorite.';
}

export { formatPriceRange, generateTags, NEIGHBORHOOD_CENTERS };
