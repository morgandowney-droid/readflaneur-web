-- Add rejection_reason column to ads table
ALTER TABLE ads ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Update status enum to include new statuses
-- First, we need to handle the existing status values
-- The status column is already text, so we just need to ensure valid values

-- Add comment explaining valid status values
COMMENT ON COLUMN ads.status IS 'Valid values: pending_review, approved, rejected, active, paused, expired';

-- Update RLS policy to allow advertisers to see their rejected ads
-- (already covered by existing policy that allows select where advertiser_id = auth.uid())

-- Create index for faster admin queries on pending_review status
CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);
CREATE INDEX IF NOT EXISTS idx_ads_created_at ON ads(created_at DESC);
