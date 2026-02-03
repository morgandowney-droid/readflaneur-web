export type GlobalRegion = 'north-america' | 'europe' | 'asia-pacific' | 'middle-east';

export interface Neighborhood {
  id: string;
  name: string;
  city: string;
  timezone: string;
  country?: string;
  region?: GlobalRegion;
  latitude?: number;
  longitude?: number;
  radius?: number; // meters
  is_active?: boolean;
  is_coming_soon?: boolean;
  seeded_at?: string; // When first seeded - places discovered after this are "new"
}

export interface Article {
  id: string;
  neighborhood_id: string;
  author_id?: string;
  headline: string;
  slug?: string;
  preview_text?: string;
  body_text: string;
  image_url: string;
  images?: string[];
  status: 'draft' | 'pending' | 'published' | 'rejected' | 'suspended' | 'scheduled' | 'archived';
  scheduled_for?: string;
  rejection_reason?: string;
  editor_notes?: string;
  views?: number;
  published_at?: string;
  created_at: string;
  updated_at: string;
  article_type?: string;
  category_label?: string;
  // Joined data
  neighborhood?: Neighborhood;
  author?: Profile;
  sections?: ArticleSection[];
}

export type AdPlacement = 'feed' | 'story_open';

export interface Ad {
  id: string;
  advertiser_id?: string;
  image_url: string;
  headline: string;
  click_url: string;
  is_global: boolean;
  neighborhood_id: string | null;
  sponsor_label: string;
  placement: AdPlacement;
  status: 'pending_review' | 'approved' | 'rejected' | 'active' | 'paused' | 'expired';
  rejection_reason?: string;
  start_date?: string;
  end_date?: string;
  impressions: number;
  clicks: number;
  created_at: string;
  // Joined data for section targeting
  ad_sections?: AdSection[];
  section_ids?: string[];
}

export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  role: 'reader' | 'journalist' | 'advertiser' | 'admin';
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface AdPackage {
  id: string;
  name: string;
  description?: string;
  price_cents: number;
  duration_days: number;
  is_global: boolean;
  max_neighborhoods: number;
  active: boolean;
  created_at: string;
}

export interface AdOrder {
  id: string;
  advertiser_id: string;
  ad_id: string;
  package_id: string;
  stripe_payment_intent_id?: string;
  stripe_session_id?: string;
  amount_cents: number;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  paid_at?: string;
  created_at: string;
}

export type FeedItemType = 'article' | 'ad';

export interface FeedItem {
  type: FeedItemType;
  data: Article | Ad;
}

// Tips system types
export type TipStatus = 'pending' | 'under_review' | 'approved' | 'rejected' | 'converted';
export type CreditPreference = 'anonymous' | 'name_only' | 'name_and_contact';

export interface Tip {
  id: string;
  content: string;
  headline?: string;
  neighborhood_id: string;
  user_id?: string;

  // Contact info
  submitter_name?: string;
  submitter_email?: string;
  submitter_phone?: string;
  credit_preference: CreditPreference;
  allow_credit: boolean;

  // Location
  gps_latitude?: number;
  gps_longitude?: number;
  gps_accuracy?: number;

  // Device info
  ip_address_hash?: string;
  timezone?: string;
  user_agent?: string;
  device_type?: string;
  browser?: string;
  os?: string;
  screen_resolution?: string;
  language?: string;

  // Photos
  photo_urls: string[];

  // Review workflow
  status: TipStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  reviewer_notes?: string;
  rejection_reason?: string;

  // Terms
  terms_accepted: boolean;
  terms_accepted_at?: string;
  terms_version: string;

  // Timestamps
  created_at: string;
  updated_at: string;

  // Joined data
  neighborhood?: Neighborhood;
  reviewer?: Profile;
  user?: Profile;
  photos?: TipPhoto[];
}

export interface TipPhoto {
  id: string;
  tip_id: string;
  storage_path: string;
  public_url: string;
  filename?: string;
  file_size?: number;
  mime_type?: string;
  caption?: string;
  order_index: number;
  created_at: string;
}

export interface TipSubmission {
  content: string;
  headline?: string;
  neighborhood_id: string;
  submitter_name?: string;
  submitter_email?: string;
  submitter_phone?: string;
  credit_preference: CreditPreference;
  allow_credit: boolean;
  photo_urls?: string[];
  gps_latitude?: number;
  gps_longitude?: number;
  gps_accuracy?: number;
  terms_accepted: boolean;
  terms_version?: string;
}

// Sections system types
export interface Section {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ArticleSection {
  id: string;
  article_id: string;
  section_id: string;
  confidence?: number;
  created_at: string;
  // Joined data
  section?: Section;
}

export interface UserSectionInterest {
  id: string;
  user_id: string;
  section_id: string;
  created_at: string;
  // Joined data
  section?: Section;
}

export interface AdSection {
  id: string;
  ad_id: string;
  section_id: string;
  created_at: string;
  // Joined data
  section?: Section;
}
