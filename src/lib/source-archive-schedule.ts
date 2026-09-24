/**
 * Defer source archiving past the publishing request.
 *
 * Called at every article insert path right after the article_sources rows
 * are written. Inside a request (every cron route, the email assembler) the
 * work runs after the response via Next's after(), so a slow source page can
 * never hold up or fail the insert, the email send, or a cron's time budget.
 * Outside a request scope (a script) after() throws and the work runs as a
 * plain background promise instead. Either way nothing is awaited here and
 * nothing throws; the archive-article-sources cron catches whatever a
 * deferred run did not finish.
 */
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { archiveArticleSources, ARCHIVE_BUDGET_MS } from './source-archive';

export function scheduleSourceArchive(admin: SupabaseClient, articleId: string | null | undefined): void {
  if (!articleId) return;
  const run = () => archiveArticleSources(admin, articleId, { budgetMs: ARCHIVE_BUDGET_MS }).then(() => undefined, () => undefined);
  try {
    after(run);
  } catch {
    void run();
  }
}
