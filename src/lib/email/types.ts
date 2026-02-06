/**
 * Types for the Daily Brief Email Service
 */

export interface EmailRecipient {
  id: string;
  email: string;
  source: 'profile' | 'newsletter';
  timezone: string;
  primaryNeighborhoodId: string | null;
  subscribedNeighborhoodIds: string[];
  unsubscribeToken: string;
  pausedTopics: string[]; // category_labels to exclude from email
}

export interface DailyBriefContent {
  recipient: EmailRecipient;
  date: string; // Formatted date string in recipient's timezone
  primarySection: PrimaryNeighborhoodSection | null;
  satelliteSections: SatelliteNeighborhoodSection[];
  headerAd: EmailAd | null;
  nativeAd: EmailAd | null;
}

export interface PrimaryNeighborhoodSection {
  neighborhoodId: string;
  neighborhoodName: string;
  cityName: string;
  weather: WeatherData | null;
  weatherStory: WeatherStory | null;
  stories: EmailStory[];
}

export interface SatelliteNeighborhoodSection {
  neighborhoodId: string;
  neighborhoodName: string;
  cityName: string;
  stories: EmailStory[];
}

export interface EmailStory {
  headline: string;
  previewText: string;
  imageUrl: string | null;
  categoryLabel: string | null;
  articleUrl: string;
  location: string; // e.g., "Beverly Hills, Los Angeles"
}

export interface WeatherData {
  temperatureC: number;
  temperatureF: number;
  description: string;
  weatherCode: number;
  asOfTime: string; // e.g., "7:00 AM"
}

export interface WeatherStory {
  priority: 1 | 2 | 3 | 4;
  headline: string;
  body: string;
  icon: string; // 'snow' | 'rain' | 'sun' | 'thermometer-up' | 'thermometer-down'
  temperatureC: number;
  temperatureF: number;
  forecastDay: string; // "Tomorrow (Sat)" or "Sunday"
}

export interface EmailAd {
  id: string;
  imageUrl: string;
  headline: string;
  clickUrl: string;
  sponsorLabel: string;
  impressionUrl: string;
}
