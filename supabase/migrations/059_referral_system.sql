-- Referral system: codes, tracking, conversions

-- 1. Function to generate unique 8-char alphanumeric referral codes
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghjkmnpqrstuvwxyz23456789'; -- no ambiguous chars (i,l,o,0,1)
  code TEXT := '';
  i INT;
  max_attempts INT := 20;
  attempt INT := 0;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;

    -- Check uniqueness across both tables
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE referral_code = code)
       AND NOT EXISTS (SELECT 1 FROM newsletter_subscribers WHERE referral_code = code)
    THEN
      RETURN code;
    END IF;

    attempt := attempt + 1;
    IF attempt >= max_attempts THEN
      RAISE EXCEPTION 'Could not generate unique referral code after % attempts', max_attempts;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 2. Add referral_code column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- 3. Add referral_code column to newsletter_subscribers
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- 4. Create referrals tracking table
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code TEXT NOT NULL,
  referrer_type TEXT NOT NULL CHECK (referrer_type IN ('profile', 'newsletter')),
  referrer_id UUID NOT NULL,
  referred_email TEXT,
  referred_type TEXT CHECK (referred_type IN ('profile', 'newsletter')),
  referred_id UUID,
  status TEXT NOT NULL DEFAULT 'clicked' CHECK (status IN ('clicked', 'converted')),
  ip_hash TEXT,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for looking up referrals by code
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);

-- Unique index: one conversion per referral code + email
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_unique_conversion
  ON referrals(referral_code, referred_email) WHERE status = 'converted';

-- Index for stats queries
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id, referrer_type);

-- 5. RLS: service_role only
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on referrals"
  ON referrals FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
