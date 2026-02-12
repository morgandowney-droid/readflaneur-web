'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface CommunityNeighborhood {
  id: string;
  name: string;
  city: string;
  country: string | null;
  timezone: string | null;
  is_active: boolean;
  community_status: 'active' | 'removed';
  created_by: string | null;
  creator_email: string | null;
  created_at: string;
}

type FilterStatus = 'all' | 'active' | 'removed';

export default function AdminCommunityNeighborhoodsPage() {
  const router = useRouter();
  const [neighborhoods, setNeighborhoods] = useState<CommunityNeighborhood[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadNeighborhoods();
  }, []);

  async function loadNeighborhoods() {
    try {
      const res = await fetch('/api/admin/community-neighborhoods');
      if (res.status === 401) {
        router.push('/login?redirect=/admin/community-neighborhoods');
        return;
      }
      const data = await res.json();
      setNeighborhoods(data.neighborhoods || []);
    } catch (err) {
      console.error('Error loading community neighborhoods:', err);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, community_status: 'active' | 'removed') {
    setProcessingId(id);
    try {
      const res = await fetch('/api/admin/community-neighborhoods', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, community_status }),
      });
      if (res.ok) {
        setNeighborhoods(prev =>
          prev.map(n => n.id === id ? { ...n, community_status, is_active: community_status === 'active' } : n)
        );
      }
    } catch (err) {
      console.error('Update error:', err);
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

  const filtered = filter === 'all' ? neighborhoods : neighborhoods.filter(n => n.community_status === filter);

  const counts = neighborhoods.reduce((acc, n) => {
    acc[n.community_status] = (acc[n.community_status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <p className="text-neutral-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <Link href="/admin" className="text-sm text-neutral-500 hover:text-white mb-6 inline-block">
          &larr; Back to Admin
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-light text-neutral-100 mb-2">Community Neighborhoods</h1>
          <p className="text-neutral-500">
            {neighborhoods.length} total - {counts['active'] || 0} active, {counts['removed'] || 0} removed
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total', count: neighborhoods.length, color: 'text-white' },
            { label: 'Active', count: counts['active'] || 0, color: 'text-green-400' },
            { label: 'Removed', count: counts['removed'] || 0, color: 'text-neutral-400' },
          ].map(stat => (
            <div key={stat.label} className="bg-surface border border-white/[0.08] p-4">
              <p className="text-xs tracking-widest uppercase text-neutral-500 mb-1">{stat.label}</p>
              <p className={`text-2xl font-light ${stat.color}`}>{stat.count}</p>
            </div>
          ))}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(['all', 'active', 'removed'] as FilterStatus[]).map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 text-sm tracking-widest uppercase ${
                filter === status
                  ? 'bg-white text-neutral-900'
                  : 'bg-surface text-neutral-400 border border-white/[0.08] hover:border-white/20'
              }`}
            >
              {status}
              {status !== 'all' && counts[status] ? ` (${counts[status]})` : ''}
            </button>
          ))}
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="bg-surface border border-white/[0.08] p-12 text-center">
            <p className="text-neutral-400">
              No {filter === 'all' ? '' : filter + ' '}community neighborhoods found.
            </p>
          </div>
        ) : (
          <div className="bg-surface border border-white/[0.08] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-neutral-800">
                  <th className="text-left px-4 py-3 text-xs tracking-widest uppercase text-neutral-400 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-xs tracking-widest uppercase text-neutral-400 font-medium">City</th>
                  <th className="text-left px-4 py-3 text-xs tracking-widest uppercase text-neutral-400 font-medium">Country</th>
                  <th className="text-left px-4 py-3 text-xs tracking-widest uppercase text-neutral-400 font-medium">Creator</th>
                  <th className="text-left px-4 py-3 text-xs tracking-widest uppercase text-neutral-400 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-xs tracking-widest uppercase text-neutral-400 font-medium">Created</th>
                  <th className="text-left px-4 py-3 text-xs tracking-widest uppercase text-neutral-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(n => (
                  <tr key={n.id} className="border-b border-white/[0.06] hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <p className="text-neutral-100 font-medium">{n.name}</p>
                      <p className="text-xs text-neutral-600 font-mono">{n.id}</p>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">{n.city}</td>
                    <td className="px-4 py-3 text-neutral-400">{n.country || '-'}</td>
                    <td className="px-4 py-3 text-neutral-400 text-xs">
                      {n.creator_email || <span className="text-neutral-600">Unknown</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 text-xs tracking-widest uppercase ${
                        n.community_status === 'active'
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-neutral-500/15 text-neutral-400'
                      }`}>
                        {n.community_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-500 text-xs whitespace-nowrap">
                      {formatDate(n.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {n.community_status === 'active' ? (
                        <button
                          onClick={() => updateStatus(n.id, 'removed')}
                          disabled={processingId === n.id}
                          className="px-2 py-1 text-xs bg-red-500/15 text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          onClick={() => updateStatus(n.id, 'active')}
                          disabled={processingId === n.id}
                          className="px-2 py-1 text-xs bg-green-500/15 text-green-400 hover:bg-green-500/25 disabled:opacity-50"
                        >
                          Restore
                        </button>
                      )}
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
