-- Fix newsletter house ad: link to /invite instead of broken /email/subscribe
UPDATE house_ads SET click_url = '/invite' WHERE type = 'newsletter';
