/**
 * Cron Monitoring System - Type Definitions
 */

export type IssueType =
  | 'missing_image'
  | 'placeholder_image'
  | 'missing_brief'
  | 'job_failure'
  | 'api_rate_limit'
  | 'external_service_down';

export type IssueStatus = 'open' | 'resolved' | 'needs_manual' | 'retrying';

export interface CronExecution {
  id: string;
  job_name: string;
  started_at: string;
  completed_at: string | null;
  success: boolean;
  articles_created: number;
  errors: string[];
  response_data: Record<string, unknown> | null;
  triggered_by: string;
}

export interface CronIssue {
  id: string;
  issue_type: IssueType;
  article_id: string | null;
  neighborhood_id: string | null;
  job_name: string | null;
  description: string;
  status: IssueStatus;
  retry_count: number;
  max_retries: number;
  next_retry_at: string | null;
  auto_fixable: boolean;
  fix_attempted_at: string | null;
  fix_result: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface DetectedIssue {
  issue_type: IssueType;
  article_id?: string;
  neighborhood_id?: string;
  job_name?: string;
  description: string;
  auto_fixable: boolean;
}

export interface FixResult {
  success: boolean;
  message: string;
  imageUrl?: string;
}

export interface MonitorRunResult {
  started_at: string;
  completed_at: string;
  issues_detected: number;
  issues_fixed: number;
  issues_failed: number;
  issues_skipped: number;
  details: {
    new_issues: DetectedIssue[];
    fix_attempts: Array<{
      issue_id: string;
      issue_type: IssueType;
      result: FixResult;
    }>;
  };
}

// Auto-fix configuration
export const FIX_CONFIG = {
  // Max retries per issue
  MAX_RETRIES: 3,

  // Rate limit: max image regenerations per monitor run
  MAX_IMAGES_PER_RUN: 5,

  // Rate limit: max brief regenerations per monitor run
  MAX_BRIEFS_PER_RUN: 10,

  // Delay between image generation calls (ms)
  IMAGE_GEN_DELAY_MS: 3000,

  // Delay between brief generation calls (ms)
  BRIEF_GEN_DELAY_MS: 1000,

  // Look back window for detecting issues (hours)
  ISSUE_DETECTION_WINDOW_HOURS: 6,

  // Retry backoff intervals (minutes)
  RETRY_BACKOFF: [0, 15, 60], // immediate, 15min, 1hr

  // Placeholder SVG patterns to detect
  PLACEHOLDER_PATTERNS: [
    /LOCAL\s*NEWS/i,
    /<svg[^>]*xmlns/i,
    /\.svg$/i,
  ],
} as const;
