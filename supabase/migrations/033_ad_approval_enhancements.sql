-- Ad Approval Workflow Enhancements
-- Adds Design Concierge support and Passionfroot webhook integration fields.

-- Design service flag: true when client has purchased creative production
ALTER TABLE ads ADD COLUMN IF NOT EXISTS needs_design_service BOOLEAN NOT NULL DEFAULT FALSE;

-- Internal admin notes (never shown to advertiser)
ALTER TABLE ads ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Passionfroot order tracking (for webhook-created ads)
ALTER TABLE ads ADD COLUMN IF NOT EXISTS passionfroot_order_id TEXT;

-- Client info for webhook-created ads (buyer may not be a Flaneur user)
ALTER TABLE ads ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS client_email TEXT;

-- Prevent duplicate webhook processing
CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_passionfroot_order
  ON ads(passionfroot_order_id) WHERE passionfroot_order_id IS NOT NULL;
