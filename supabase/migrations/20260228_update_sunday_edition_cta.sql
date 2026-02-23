-- Change Sunday Edition house ad CTA from "Place it Now" to "Place it"
UPDATE house_ads SET cta_text = 'Place it' WHERE type = 'sunday_edition' AND cta_text = 'Place it Now';
