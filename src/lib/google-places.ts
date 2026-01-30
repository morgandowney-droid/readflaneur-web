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
  photos?: { name: string }[];
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
export async function searchPlaces(
  neighborhoodId: string,
  categorySlug: string
): Promise<GooglePlaceNew[]> {
  if (!GOOGLE_PLACES_API_KEY) {
    console.error('GOOGLE_PLACES_API_KEY not configured');
    return [];
  }

  const center = NEIGHBORHOOD_CENTERS[neighborhoodId];
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

  // The new API allows multiple types in one request
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.businessStatus,places.websiteUri,places.nationalPhoneNumber,places.editorialSummary',
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
        rankPreference: 'POPULARITY',
      }),
    });

    const data = await response.json();

    if (data.places) {
      // Filter out permanently closed places
      const openPlaces = data.places.filter(
        (p: GooglePlaceNew) => p.businessStatus !== 'CLOSED_PERMANENTLY'
      );
      allPlaces.push(...openPlaces);
    }
  } catch (error) {
    console.error(`Error fetching places for ${categorySlug}:`, error);
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
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,rating,priceLevel,editorialSummary,reviews',
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

export { formatPriceRange, generateTags };
