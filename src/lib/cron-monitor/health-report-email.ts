/**
 * Daily Content Health Monitor - Email Report Template
 *
 * Builds an HTML email summarizing all health check results.
 */

import { HealthCheckResult } from './health-checks';

function statusColor(status: 'pass' | 'warn' | 'fail'): string {
  switch (status) {
    case 'pass': return '#10b981';
    case 'warn': return '#f59e0b';
    case 'fail': return '#ef4444';
  }
}

function statusLabel(status: 'pass' | 'warn' | 'fail'): string {
  switch (status) {
    case 'pass': return 'PASS';
    case 'warn': return 'WARN';
    case 'fail': return 'FAIL';
  }
}

function worstStatus(results: HealthCheckResult[]): 'pass' | 'warn' | 'fail' {
  if (results.some(r => r.status === 'fail')) return 'fail';
  if (results.some(r => r.status === 'warn')) return 'warn';
  return 'pass';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function buildHealthReportEmail(
  results: HealthCheckResult[],
  date: Date,
  runDurationMs: number
): string {
  const overall = worstStatus(results);
  const passCount = results.filter(r => r.status === 'pass').length;
  const warnCount = results.filter(r => r.status === 'warn').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';

  const checkRows = results.map(r => {
    const color = statusColor(r.status);
    const badge = `<span style="display: inline-block; background: ${color}; color: #fff; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 600; letter-spacing: 0.05em;">${statusLabel(r.status)}</span>`;

    const statsLine = r.total > 0
      ? `<span style="color: #888; font-size: 13px;">${r.passing}/${r.total} passing</span>`
      : `<span style="color: #888; font-size: 13px;">No data</span>`;

    const detailsList = r.details.length > 0
      ? `<ul style="margin: 8px 0 0 0; padding-left: 16px; color: #666; font-size: 13px;">${r.details.map(d => `<li style="margin-bottom: 4px;">${escapeHtml(d)}</li>`).join('')}</ul>`
      : '';

    return `
      <div style="border-bottom: 1px solid #eee; padding: 16px 0;">
        <div style="display: flex; align-items: center; gap: 12px;">
          ${badge}
          <strong style="font-size: 15px;">${escapeHtml(r.name)}</strong>
          ${statsLine}
        </div>
        ${detailsList}
      </div>
    `;
  }).join('');

  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="text-align: center; padding: 24px 0 16px;">
        <h1 style="font-weight: 300; letter-spacing: 0.1em; margin: 0;">FLANEUR</h1>
        <p style="color: #888; font-size: 13px; margin: 4px 0 0; letter-spacing: 0.05em;">DAILY HEALTH REPORT</p>
      </div>

      <div style="text-align: center; margin-bottom: 24px;">
        <p style="font-size: 15px; color: #666; margin: 0;">${formatDate(date)}</p>
      </div>

      <div style="background: ${statusColor(overall)}15; border: 1px solid ${statusColor(overall)}40; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px;">
        <span style="display: inline-block; background: ${statusColor(overall)}; color: #fff; padding: 4px 16px; border-radius: 4px; font-size: 14px; font-weight: 600; letter-spacing: 0.1em;">${statusLabel(overall)}</span>
        <p style="margin: 8px 0 0; font-size: 14px; color: #555;">
          ${passCount} pass &middot; ${warnCount} warn &middot; ${failCount} fail &middot; ${totalIssues} issue${totalIssues !== 1 ? 's' : ''} created
        </p>
      </div>

      ${checkRows}

      <div style="text-align: center; margin: 32px 0;">
        <a href="${appUrl}/admin/cron-monitor" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em; font-size: 14px; border-radius: 4px;">
          View Dashboard
        </a>
      </div>

      <p style="color: #999; font-size: 12px; text-align: center;">
        Completed in ${(runDurationMs / 1000).toFixed(1)}s &middot; Auto-fixable issues sent to monitor-and-fix
      </p>
    </div>
  `;
}

export function getHealthReportSubject(results: HealthCheckResult[], date: Date): string {
  const overall = worstStatus(results);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `[Flaneur] Health Report: ${dateStr} - ${statusLabel(overall)}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
