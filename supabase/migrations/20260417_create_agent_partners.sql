-- Agent Partners: self-serve branded newsletter sponsorship for real estate agents
-- One agent per neighborhood, $999/month subscription

CREATE TABLE agent_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Agent identity
  agent_name TEXT NOT NULL,
  agent_title TEXT, -- "Licensed Associate Broker"
  agent_email TEXT NOT NULL,
  agent_phone TEXT,
  agent_photo_url TEXT,
  brokerage_name TEXT, -- "Sotheby's International Realty"
  -- Neighborhood
  neighborhood_id TEXT NOT NULL REFERENCES neighborhoods(id),
  agent_slug TEXT NOT NULL UNIQUE, -- URL-safe slug for /r/[slug]
  -- Listings (up to 3, stored as JSONB array)
  listings JSONB DEFAULT '[]'::jsonb,
  -- Each listing: { address, price, beds, baths, sqft, description, photo_url, link_url }
  -- Subscriber management
  client_emails TEXT[] DEFAULT '{}',
  -- Payment
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'paused', 'cancelled')),
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

-- One agent per neighborhood (only among active/setup partners)
CREATE UNIQUE INDEX idx_agent_partners_neighborhood ON agent_partners(neighborhood_id) WHERE status IN ('setup', 'active');
-- Slug lookup
CREATE UNIQUE INDEX idx_agent_partners_slug ON agent_partners(agent_slug);

-- RLS: service_role only (agents interact via API routes, not direct DB access)
ALTER TABLE agent_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON agent_partners FOR ALL USING (true) WITH CHECK (true);

-- Add partner_agent_id to newsletter_subscribers for tracking agent-sourced subscribers
ALTER TABLE newsletter_subscribers ADD COLUMN partner_agent_id UUID REFERENCES agent_partners(id);
