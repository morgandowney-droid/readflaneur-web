'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface CronExecution {
  id: string;
  job_name: string;
  started_at: string;
  completed_at: string | null;
  success: boolean;
  articles_created: number;
  errors: string[];
  response_data: Record<string, unknown> | null;
}

interface CronIssue {
  id: string;
  issue_type: string;
  article_id: string | null;
  job_name: string | null;
  description: string;
  status: string;
  retry_count: number;
  max_retries: number;
  next_retry_at: string | null;
  auto_fixable: boolean;
  fix_result: string | null;
  created_at: string;
  resolved_at: string | null;
  article?: { headline: string } | null;
}

interface Stats {
  totalIssues: number;
  openIssues: number;
  resolvedToday: number;
  failedJobs24h: number;
  successfulJobs24h: number;
}

export default function CronMonitorPage() {
  const [executions, setExecutions] = useState<CronExecution[]>([]);
  const [issues, setIssues] = useState<CronIssue[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'issues' | 'executions'>('overview');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const supabase = createClient();

    // Load recent executions
    const { data: executionsData } = await supabase
      .from('cron_executions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(100);

    // Load issues with article info
    const { data: issuesData } = await supabase
      .from('cron_issues')
      .select('*, article:articles(headline)')
      .order('created_at', { ascending: false })
      .limit(100);

    // Calculate stats
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const execList = executionsData || [];
    const issueList = issuesData || [];

    const statsData: Stats = {
      totalIssues: issueList.length,
      openIssues: issueList.filter(i => i.status === 'open' || i.status === 'retrying').length,
      resolvedToday: issueList.filter(i =>
        i.status === 'resolved' &&
        i.resolved_at &&
        new Date(i.resolved_at) >= todayStart
      ).length,
      failedJobs24h: execList.filter(e =>
        !e.success &&
        new Date(e.started_at) >= oneDayAgo
      ).length,
      successfulJobs24h: execList.filter(e =>
        e.success &&
        new Date(e.started_at) >= oneDayAgo
      ).length,
    };

    setExecutions(execList);
    setIssues(issueList);
    setStats(statsData);
    setLoading(false);
  };

  const handleForceRetry = async (issueId: string) => {
    setActionLoading(issueId);
    const supabase = createClient();

    await supabase
      .from('cron_issues')
      .update({
        status: 'open',
        next_retry_at: new Date().toISOString(),
      })
      .eq('id', issueId);

    await loadData();
    setActionLoading(null);
  };

  const handleMarkResolved = async (issueId: string) => {
    setActionLoading(issueId);
    const supabase = createClient();

    await supabase
      .from('cron_issues')
      .update({
        status: 'resolved',
        fix_result: 'Manually resolved',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', issueId);

    await loadData();
    setActionLoading(null);
  };

  const handleRunMonitor = async () => {
    setActionLoading('monitor');
    try {
      const response = await fetch('/api/cron/monitor-and-fix', {
        headers: {
          'x-cron-secret': 'manual',
        },
      });
      const data = await response.json();
      console.log('Monitor result:', data);
      await loadData();
    } catch (error) {
      console.error('Error running monitor:', error);
    }
    setActionLoading(null);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-yellow-100 text-yellow-800',
      retrying: 'bg-blue-100 text-blue-800',
      resolved: 'bg-green-100 text-green-800',
      needs_manual: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getIssueTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      missing_image: 'bg-orange-100 text-orange-800',
      placeholder_image: 'bg-purple-100 text-purple-800',
      job_failure: 'bg-red-100 text-red-800',
      api_rate_limit: 'bg-yellow-100 text-yellow-800',
      external_service_down: 'bg-gray-100 text-gray-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const filteredIssues = issues.filter(issue => {
    if (filterStatus === 'all') return true;
    return issue.status === filterStatus;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-8" />
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-24 bg-gray-200 rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700 mb-2 block">
              &larr; Back to Admin
            </Link>
            <h1 className="text-2xl font-semibold text-gray-900">Cron Job Monitor</h1>
            <p className="text-gray-500 mt-1">Self-healing system for cron job issues</p>
          </div>
          <button
            onClick={handleRunMonitor}
            disabled={actionLoading === 'monitor'}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {actionLoading === 'monitor' ? 'Running...' : 'Run Monitor Now'}
          </button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Open Issues</div>
              <div className="text-2xl font-bold text-yellow-600">{stats.openIssues}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Resolved Today</div>
              <div className="text-2xl font-bold text-green-600">{stats.resolvedToday}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Jobs OK (24h)</div>
              <div className="text-2xl font-bold text-green-600">{stats.successfulJobs24h}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Jobs Failed (24h)</div>
              <div className="text-2xl font-bold text-red-600">{stats.failedJobs24h}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Total Issues</div>
              <div className="text-2xl font-bold text-gray-600">{stats.totalIssues}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b">
            <div className="flex">
              {(['overview', 'issues', 'executions'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 text-sm font-medium ${
                    activeTab === tab
                      ? 'border-b-2 border-blue-500 text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium mb-4">Recent Open Issues</h3>
                  {issues.filter(i => i.status === 'open' || i.status === 'retrying').length === 0 ? (
                    <p className="text-gray-500">No open issues</p>
                  ) : (
                    <div className="space-y-2">
                      {issues
                        .filter(i => i.status === 'open' || i.status === 'retrying')
                        .slice(0, 5)
                        .map(issue => (
                          <div key={issue.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-1 text-xs rounded ${getIssueTypeBadge(issue.issue_type)}`}>
                                {issue.issue_type.replace('_', ' ')}
                              </span>
                              <span className="text-sm text-gray-700 truncate max-w-md">
                                {issue.description}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">
                                Retry {issue.retry_count}/{issue.max_retries}
                              </span>
                              <button
                                onClick={() => handleForceRetry(issue.id)}
                                disabled={actionLoading === issue.id}
                                className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                              >
                                Retry
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-4">Recent Failed Jobs</h3>
                  {executions.filter(e => !e.success).length === 0 ? (
                    <p className="text-gray-500">No recent failures</p>
                  ) : (
                    <div className="space-y-2">
                      {executions
                        .filter(e => !e.success)
                        .slice(0, 5)
                        .map(exec => (
                          <div key={exec.id} className="flex items-center justify-between p-3 bg-red-50 rounded">
                            <div>
                              <span className="font-medium text-gray-900">{exec.job_name}</span>
                              <span className="text-xs text-gray-500 ml-2">
                                {formatDate(exec.started_at)}
                              </span>
                            </div>
                            <span className="text-sm text-red-600 truncate max-w-xs">
                              {exec.errors?.[0] || 'Unknown error'}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Issues Tab */}
            {activeTab === 'issues' && (
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="all">All Status</option>
                    <option value="open">Open</option>
                    <option value="retrying">Retrying</option>
                    <option value="resolved">Resolved</option>
                    <option value="needs_manual">Needs Manual</option>
                  </select>
                  <span className="text-sm text-gray-500">
                    Showing {filteredIssues.length} issues
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Retries</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredIssues.map(issue => (
                        <tr key={issue.id}>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs rounded ${getIssueTypeBadge(issue.issue_type)}`}>
                              {issue.issue_type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-900 truncate max-w-xs" title={issue.description}>
                              {issue.description}
                            </div>
                            {issue.article && (
                              <div className="text-xs text-gray-500 truncate max-w-xs">
                                Article: {issue.article.headline}
                              </div>
                            )}
                            {issue.fix_result && (
                              <div className="text-xs text-gray-400 truncate max-w-xs">
                                Result: {issue.fix_result}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs rounded ${getStatusBadge(issue.status)}`}>
                              {issue.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {issue.retry_count}/{issue.max_retries}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {formatDate(issue.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              {(issue.status === 'open' || issue.status === 'needs_manual') && (
                                <>
                                  <button
                                    onClick={() => handleForceRetry(issue.id)}
                                    disabled={actionLoading === issue.id}
                                    className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                                  >
                                    Retry
                                  </button>
                                  <button
                                    onClick={() => handleMarkResolved(issue.id)}
                                    disabled={actionLoading === issue.id}
                                    className="text-xs text-green-600 hover:underline disabled:opacity-50"
                                  >
                                    Resolve
                                  </button>
                                </>
                              )}
                              {issue.article_id && (
                                <Link
                                  href={`/admin/articles?id=${issue.article_id}`}
                                  className="text-xs text-gray-600 hover:underline"
                                >
                                  View
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Executions Tab */}
            {activeTab === 'executions' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Articles</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {executions.map(exec => {
                      const duration = exec.completed_at
                        ? Math.round((new Date(exec.completed_at).getTime() - new Date(exec.started_at).getTime()) / 1000)
                        : null;
                      return (
                        <tr key={exec.id}>
                          <td className="px-4 py-3 font-medium text-gray-900">{exec.job_name}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 text-xs rounded ${
                                exec.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {exec.success ? 'Success' : 'Failed'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{exec.articles_created}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{formatDate(exec.started_at)}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {duration !== null ? `${duration}s` : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {exec.errors && exec.errors.length > 0 && (
                              <span className="text-red-600 truncate max-w-xs block" title={exec.errors.join(', ')}>
                                {exec.errors[0]}
                              </span>
                            )}
                            {exec.response_data && (
                              <span className="text-gray-400 text-xs">
                                {JSON.stringify(exec.response_data).substring(0, 50)}...
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
