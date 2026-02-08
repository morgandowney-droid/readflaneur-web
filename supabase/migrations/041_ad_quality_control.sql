-- Ad Quality Control & Customer Approval System
-- Adds AI quality scoring, copy polishing, and customer proof approval flow

-- New columns on ads table
ALTER TABLE ads ADD COLUMN IF NOT EXISTS ai_quality_score INTEGER;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS ai_flag_reason TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS ai_suggested_rewrite TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS original_copy TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS proof_token UUID DEFAULT gen_random_uuid();
ALTER TABLE ads ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending_ai';
ALTER TABLE ads ADD COLUMN IF NOT EXISTS customer_change_request TEXT;

-- Constraint on approval_status
ALTER TABLE ads ADD CONSTRAINT ads_approval_status_check
  CHECK (approval_status IN ('pending_ai', 'pending_approval', 'approved', 'changes_requested'));

-- Unique index on proof_token for fast lookup (only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_proof_token
  ON ads (proof_token) WHERE proof_token IS NOT NULL;

-- Index for finding ads needing AI processing
CREATE INDEX IF NOT EXISTS idx_ads_pending_ai
  ON ads (approval_status) WHERE approval_status = 'pending_ai';
