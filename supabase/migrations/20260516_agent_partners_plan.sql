-- Distinguishes free "Founding Partner" brokers from paid Stripe subscribers.
-- Free activation (/api/partner/activate) sets plan='free'; the Stripe webhook
-- sets plan='paid'. Lets us identify who to convert when pricing launches.
ALTER TABLE public.agent_partners
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

COMMENT ON COLUMN public.agent_partners.plan IS 'free = Founding Partner (free during beta); paid = Stripe subscription';
