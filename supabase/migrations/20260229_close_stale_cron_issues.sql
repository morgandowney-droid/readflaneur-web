-- Bulk-close stale open issues older than 5 days.
-- The auto-fixer has proven it can't handle these (1,544 accumulated since Feb 16).
-- This clears the backlog so the fixed auto-fixer can process current issues.

UPDATE cron_issues
SET status = 'needs_manual',
    fix_result = 'Auto-closed: issue older than 5 days'
WHERE status = 'open'
  AND created_at < NOW() - INTERVAL '5 days';
