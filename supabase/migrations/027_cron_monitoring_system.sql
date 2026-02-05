-- Cron Job Monitoring and Auto-Fix System
-- Tracks cron job executions and issues that need attention

-- Track cron job executions
CREATE TABLE IF NOT EXISTS cron_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  success BOOLEAN DEFAULT false,
  articles_created INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  response_data JSONB,
  triggered_by TEXT DEFAULT 'vercel_cron'
);

-- Index for quick lookups by job name and time
CREATE INDEX IF NOT EXISTS idx_cron_executions_job_name ON cron_executions(job_name);
CREATE INDEX IF NOT EXISTS idx_cron_executions_started_at ON cron_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_executions_success ON cron_executions(success);

-- Track issues needing attention
CREATE TABLE IF NOT EXISTS cron_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_type TEXT NOT NULL,  -- 'missing_image', 'placeholder_image', 'job_failure', 'api_rate_limit', 'external_service_down'
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  job_name TEXT,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'open',  -- 'open', 'resolved', 'needs_manual', 'retrying'
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  auto_fixable BOOLEAN DEFAULT true,
  fix_attempted_at TIMESTAMPTZ,
  fix_result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Indexes for issue tracking
CREATE INDEX IF NOT EXISTS idx_cron_issues_status ON cron_issues(status);
CREATE INDEX IF NOT EXISTS idx_cron_issues_type ON cron_issues(issue_type);
CREATE INDEX IF NOT EXISTS idx_cron_issues_article_id ON cron_issues(article_id);
CREATE INDEX IF NOT EXISTS idx_cron_issues_next_retry ON cron_issues(next_retry_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_cron_issues_created_at ON cron_issues(created_at DESC);

-- Unique constraint to prevent duplicate issues for same article/type
CREATE UNIQUE INDEX IF NOT EXISTS idx_cron_issues_unique_article
ON cron_issues(article_id, issue_type)
WHERE status IN ('open', 'retrying');

-- Enable RLS
ALTER TABLE cron_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_issues ENABLE ROW LEVEL SECURITY;

-- Policies for service role access (cron jobs use service role)
CREATE POLICY "Service role full access to cron_executions"
ON cron_executions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access to cron_issues"
ON cron_issues FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Read-only access for authenticated users (admin dashboard)
CREATE POLICY "Authenticated users can view cron_executions"
ON cron_executions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can view cron_issues"
ON cron_issues FOR SELECT
TO authenticated
USING (true);

-- Comment on tables
COMMENT ON TABLE cron_executions IS 'Tracks all cron job executions with results and timing';
COMMENT ON TABLE cron_issues IS 'Tracks issues detected by the monitoring system that need attention';
