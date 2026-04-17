-- Add auth token columns to agent_partners for dashboard magic link authentication
ALTER TABLE agent_partners ADD COLUMN auth_token TEXT;
ALTER TABLE agent_partners ADD COLUMN auth_token_expires TIMESTAMPTZ;
