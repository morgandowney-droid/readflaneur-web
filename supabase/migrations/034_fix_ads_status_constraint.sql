-- Fix ads status check constraint to include pending_review and rejected
-- The original migration (001) only allowed: pending, approved, active, paused, expired
-- Migration 002 documented pending_review and rejected but didn't update the constraint

ALTER TABLE ads DROP CONSTRAINT IF EXISTS ads_status_check;
ALTER TABLE ads ADD CONSTRAINT ads_status_check
  CHECK (status IN ('pending', 'pending_review', 'approved', 'rejected', 'active', 'paused', 'expired'));
