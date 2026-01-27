export interface Neighborhood {
  id: string;
  name: string;
  city: string;
  timezone: string;
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
  // Joined data
  neighborhood?: Neighborhood;
  author?: Profile;
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
