-- Deactivate component neighborhoods that are part of combos.
-- Only the combo neighborhood (e.g., stockholm-ostermalm) should be is_active=true.
-- Components (e.g., stockholm-djurgarden) should be is_active=false so crons
-- don't generate independent daily briefs and look-ahead articles for them.
-- Content for components is generated under the combo ID.

UPDATE neighborhoods
SET is_active = false
WHERE id IN (
  SELECT component_id
  FROM combo_neighborhoods
);

-- Archive any brief_summary or look_ahead articles that were incorrectly
-- generated for component neighborhoods (they should only exist under combo IDs)
UPDATE articles
SET status = 'archived'
WHERE neighborhood_id IN (
  SELECT component_id
  FROM combo_neighborhoods
)
AND article_type IN ('brief_summary', 'look_ahead')
AND status = 'published';
