'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Suggestion {
  id: string;
  suggestion: string;
  email: string | null;
  city: string | null;
  country: string | null;
  status: 'new' | 'reviewed' | 'added' | 'dismissed';
  admin_notes: string | null;
  created_at: string;
}

type FilterStatus = 'all' | 'new' | 'reviewed' | 'added' | 'dismissed';

export default function AdminSuggestionsPage() {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadSuggestions();
  }, []);

  async function loadSuggestions() {
    try {
      const res = await fetch('/api/admin/suggestions');
      if (res.status === 401) {
        router.push('/login?redirect=/admin/suggestions');
        return;
      }
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (err) {
      console.error('Error loading suggestions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    setProcessingId(id);
    try {
      const res = await fetch('/api/admin/suggestions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        setSuggestions(prev =>
          prev.map(s => s.id === id ? { ...s, status: status as Suggestion['status'] } : s)
        );
      }
    } catch (err) {
      console.error('Update error:', err);
    }
    setProcessingId(null);
  }

  async function saveNotes(id: string) {
    setProcessingId(id);
    try {
      const res = await fetch('/api/admin/suggestions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, admin_notes: notesValue }),
      });
      if (res.ok) {
        setSuggestions(prev =>
          prev.map(s => s.id === id ? { ...s, admin_notes: notesValue || null } : s)
        );
        setEditingNotes(null);
      }
    } catch (err) {
      console.error('Notes save error:', err);
    }
    setProcessingId(null);
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'new': return 'bg-yellow-500/15 text-yellow-400';
      case 'reviewed': return 'bg-blue-500/15 text-blue-400';
      case 'added': return 'bg-green-500/15 text-green-400';
      case 'dismissed': return 'bg-neutral-500/15 text-fg-muted';
      default: return 'bg-neutral-500/15 text-fg-muted';
    }
  };

  const filtered = filter === 'all' ? suggestions : suggestions.filter(s => s.status === filter);

  const counts = suggestions.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <p className="text-fg-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <Link href="/admin" className="text-sm text-fg-subtle hover:text-fg mb-6 inline-block">
          &larr; Back to Admin
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-light text-fg mb-2">Neighborhood Suggestions</h1>
          <p className="text-fg-subtle">
            {suggestions.length} total - {counts['new'] || 0} new, {counts['reviewed'] || 0} reviewed, {counts['added'] || 0} added, {counts['dismissed'] || 0} dismissed
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'New', count: counts['new'] || 0, color: 'text-yellow-400' },
            { label: 'Reviewed', count: counts['reviewed'] || 0, color: 'text-blue-400' },
            { label: 'Added', count: counts['added'] || 0, color: 'text-green-400' },
            { label: 'Dismissed', count: counts['dismissed'] || 0, color: 'text-fg-muted' },
          ].map(stat => (
            <div key={stat.label} className="bg-surface border border-border p-4">
              <p className="text-xs tracking-widest uppercase text-fg-subtle mb-1">{stat.label}</p>
              <p className={`text-2xl font-light ${stat.color}`}>{stat.count}</p>
            </div>
          ))}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(['all', 'new', 'reviewed', 'added', 'dismissed'] as FilterStatus[]).map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 text-sm tracking-widest uppercase ${
                filter === status
                  ? 'bg-fg text-canvas'
                  : 'bg-surface text-fg-muted border border-border hover:border-border-strong'
              }`}
            >
              {status}
              {status !== 'all' && counts[status] ? ` (${counts[status]})` : ''}
            </button>
          ))}
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="bg-surface border border-border p-12 text-center">
            <p className="text-fg-muted">
              No {filter === 'all' ? '' : filter + ' '}suggestions found.
            </p>
          </div>
        ) : (
          <div className="bg-surface border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated">
                  <th className="text-left px-4 py-3 text-xs tracking-widest uppercase text-fg-muted font-medium">Suggestion</th>
                  <th className="text-left px-4 py-3 text-xs tracking-widest uppercase text-fg-muted font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-xs tracking-widest uppercase text-fg-muted font-medium">Location</th>
                  <th className="text-left px-4 py-3 text-xs tracking-widest uppercase text-fg-muted font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-xs tracking-widest uppercase text-fg-muted font-medium">Date</th>
                  <th className="text-left px-4 py-3 text-xs tracking-widest uppercase text-fg-muted font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="border-b border-white/[0.06] hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <p className="text-fg font-medium">{s.suggestion}</p>
                      {editingNotes === s.id ? (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            value={notesValue}
                            onChange={e => setNotesValue(e.target.value)}
                            placeholder="Admin notes..."
                            className="flex-1 px-2 py-1 text-xs bg-surface border border-border-strong text-white focus:border-amber-500 focus:outline-none"
                          />
                          <button
                            onClick={() => saveNotes(s.id)}
                            disabled={processingId === s.id}
                            className="px-2 py-1 text-xs bg-fg text-canvas hover:opacity-80"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingNotes(null)}
                            className="px-2 py-1 text-xs text-fg-muted hover:text-fg"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingNotes(s.id); setNotesValue(s.admin_notes || ''); }}
                          className="text-xs text-fg-subtle hover:text-fg-muted mt-1"
                        >
                          {s.admin_notes || 'Add note...'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">
                      {s.email || <span className="text-neutral-600">Anonymous</span>}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">
                      {[s.city, s.country].filter(Boolean).join(', ') || <span className="text-neutral-600">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 text-xs tracking-widest uppercase ${statusBadgeClass(s.status)}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-fg-subtle text-xs whitespace-nowrap">
                      {formatDate(s.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {s.status === 'new' && (
                          <button
                            onClick={() => updateStatus(s.id, 'reviewed')}
                            disabled={processingId === s.id}
                            className="px-2 py-1 text-xs bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 disabled:opacity-50"
                          >
                            Review
                          </button>
                        )}
                        {(s.status === 'new' || s.status === 'reviewed') && (
                          <>
                            <button
                              onClick={() => updateStatus(s.id, 'added')}
                              disabled={processingId === s.id}
                              className="px-2 py-1 text-xs bg-green-500/15 text-green-400 hover:bg-green-500/25 disabled:opacity-50"
                            >
                              Added
                            </button>
                            <button
                              onClick={() => updateStatus(s.id, 'dismissed')}
                              disabled={processingId === s.id}
                              className="px-2 py-1 text-xs bg-neutral-500/15 text-fg-muted hover:bg-neutral-500/25 disabled:opacity-50"
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                        {(s.status === 'added' || s.status === 'dismissed') && (
                          <button
                            onClick={() => updateStatus(s.id, 'new')}
                            disabled={processingId === s.id}
                            className="px-2 py-1 text-xs bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 disabled:opacity-50"
                          >
                            Reopen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
