'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface AdProof {
  id: string;
  headline: string;
  body?: string;
  image_url: string;
  click_url: string;
  sponsor_label: string;
  placement_type: 'daily_brief' | 'sunday_edition';
  status: string;
  approval_status: string;
  ai_quality_score?: number | null;
  ai_flag_reason?: string | null;
  ai_suggested_rewrite?: string | null;
  original_copy?: string | null;
  client_name?: string;
  customer_change_request?: string | null;
  created_at: string;
}

export default function ProofPage() {
  const { token } = useParams<{ token: string }>();
  const [ad, setAd] = useState<AdProof | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [changeMessage, setChangeMessage] = useState('');
  const [done, setDone] = useState<'approved' | 'changes_requested' | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/proofs/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setAd(data.ad);
          // Show terminal states
          if (data.ad.status === 'active' || data.ad.approval_status === 'approved') {
            setDone('approved');
          }
        }
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load proof');
        setLoading(false);
      });
  }, [token]);

  const handleApprove = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/proofs/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json();
      if (data.success) {
        setDone('approved');
      } else {
        setError(data.error || 'Approval failed');
      }
    } catch {
      setError('Network error');
    }
    setProcessing(false);
  };

  const handleRequestChanges = async () => {
    if (!changeMessage.trim()) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/proofs/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_changes', message: changeMessage }),
      });
      const data = await res.json();
      if (data.success) {
        setDone('changes_requested');
      } else {
        setError(data.error || 'Request failed');
      }
    } catch {
      setError('Network error');
    }
    setProcessing(false);
  };

  // Parse rewrite for display
  const getRewrite = (): { headline: string; body: string } | null => {
    if (!ad?.ai_suggested_rewrite) return null;
    try {
      return JSON.parse(ad.ai_suggested_rewrite);
    } catch {
      return null;
    }
  };

  const getOriginal = (): { headline: string; body: string } | null => {
    if (!ad?.original_copy) return null;
    try {
      return JSON.parse(ad.original_copy);
    } catch {
      return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <p className="text-fg-muted text-sm tracking-widest uppercase">Loading...</p>
      </div>
    );
  }

  if (error === 'Proof not found') {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-light tracking-wide mb-2">FLANEUR</h1>
          <p className="text-fg-subtle">This proof link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  if (ad?.status === 'rejected') {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-light tracking-wide mb-2">FLANEUR</h1>
          <div className="bg-red-50 border border-red-200 p-6 rounded-lg">
            <p className="text-red-800 font-medium mb-2">Placement Declined</p>
            <p className="text-red-600 text-sm">This placement did not pass our quality review. Please contact us for details.</p>
          </div>
        </div>
      </div>
    );
  }

  if (done === 'approved') {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-light tracking-wide mb-4">FLANEUR</h1>
          <div className="bg-green-50 border border-green-200 p-8 rounded-lg">
            <div className="text-3xl mb-3">&#10003;</div>
            <p className="text-green-800 font-medium text-lg mb-2">Approved for Publication</p>
            <p className="text-green-600 text-sm">Your placement has been approved and will appear in upcoming editions. Thank you for advertising with Flaneur.</p>
          </div>
        </div>
      </div>
    );
  }

  if (done === 'changes_requested') {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-light tracking-wide mb-4">FLANEUR</h1>
          <div className="bg-amber-50 border border-amber-200 p-8 rounded-lg">
            <p className="text-amber-800 font-medium text-lg mb-2">Changes Requested</p>
            <p className="text-amber-600 text-sm">We have received your feedback and our team will make the adjustments. You will receive a new proof link once the changes are ready.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!ad) return null;

  const rewrite = getRewrite();
  const original = getOriginal();
  const displayHeadline = showOriginal && original ? original.headline : (rewrite?.headline || ad.headline);
  const displayBody = showOriginal && original ? original.body : (rewrite?.body || ad.body || '');

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <div className="bg-surface border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-light tracking-[0.15em]">FLANEUR</h1>
            <p className="text-xs text-fg-muted mt-0.5">Ad Proof Review</p>
          </div>
          <div className="flex items-center gap-3">
            {ad.client_name && (
              <span className="text-sm text-fg-subtle">{ad.client_name}</span>
            )}
            <span className={`px-2 py-1 text-[10px] tracking-widest uppercase rounded ${
              ad.approval_status === 'pending_approval'
                ? 'bg-amber-100 text-amber-800'
                : ad.approval_status === 'changes_requested'
                  ? 'bg-orange-100 text-orange-800'
                  : 'bg-elevated text-fg-muted'
            }`}>
              {ad.approval_status === 'pending_approval' ? 'Awaiting Approval' : ad.approval_status?.replace('_', ' ')}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* AI rewrite toggle */}
        {rewrite && original && (
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-900">Editorial Polish Applied</p>
                <p className="text-xs text-blue-700 mt-0.5">Our editorial team has refined your copy for our readership.</p>
              </div>
              <button
                onClick={() => setShowOriginal(!showOriginal)}
                className="text-xs text-blue-700 underline hover:text-blue-900"
              >
                {showOriginal ? 'Show polished version' : 'Show original'}
              </button>
            </div>
          </div>
        )}

        {/* Ad Preview */}
        <div className="bg-surface border border-border rounded-lg overflow-hidden mb-6">
          <div className="p-4 border-b border-border">
            <p className="text-xs tracking-widest uppercase text-fg-muted">
              Preview — {ad.placement_type === 'sunday_edition' ? 'Sunday Edition' : 'Daily Brief'}
            </p>
          </div>

          <div className="p-6">
            {/* Ad unit mock */}
            <div className="max-w-lg mx-auto border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-surface">
                <span className="text-[10px] tracking-[0.2em] uppercase text-fg-muted">
                  PRESENTED BY {ad.sponsor_label}
                </span>
              </div>
              {ad.image_url && (
                <img
                  src={ad.image_url}
                  alt={displayHeadline}
                  className="w-full aspect-video object-cover"
                />
              )}
              <div className="p-4">
                <h3 className="font-semibold text-base mb-1">{displayHeadline || '(No headline)'}</h3>
                {displayBody && (
                  <p className="text-sm text-fg-muted">{displayBody}</p>
                )}
                {ad.click_url && (
                  <a
                    href={ad.click_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-3 text-sm text-fg-subtle hover:text-fg"
                  >
                    Learn more &rarr;
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* AI quality info */}
        {ad.ai_quality_score !== null && ad.ai_quality_score !== undefined && (
          <div className="bg-surface border border-border rounded-lg p-4 mb-6">
            <p className="text-xs tracking-widest uppercase text-fg-muted mb-2">Quality Score</p>
            <div className="flex items-center gap-3">
              <div className={`text-2xl font-light ${
                ad.ai_quality_score >= 70 ? 'text-green-600' :
                ad.ai_quality_score >= 40 ? 'text-amber-600' : 'text-red-600'
              }`}>
                {ad.ai_quality_score}
              </div>
              <div className="text-sm text-fg-subtle">
                {ad.ai_quality_score >= 70 ? 'Excellent — meets our editorial standards' :
                 ad.ai_quality_score >= 40 ? 'Acceptable — meets minimum requirements' :
                 'Below standard — consider updating your creative'}
              </div>
            </div>
            {ad.ai_flag_reason && (
              <p className="text-xs text-amber-600 mt-2">{ad.ai_flag_reason}</p>
            )}
          </div>
        )}

        {/* Actions */}
        {!showChanges ? (
          <div className="flex gap-4">
            <button
              onClick={handleApprove}
              disabled={processing}
              className="flex-1 bg-green-700 text-white py-3 text-sm tracking-widest uppercase rounded-lg hover:bg-green-800 transition-colors disabled:opacity-50"
            >
              {processing ? 'Processing...' : 'Approve for Publication'}
            </button>
            <button
              onClick={() => setShowChanges(true)}
              className="px-6 py-3 border border-border text-sm tracking-widest uppercase rounded-lg hover:border-border-strong transition-colors"
            >
              Request Changes
            </button>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-6">
            <h3 className="text-sm font-medium mb-3">What changes would you like?</h3>
            <textarea
              value={changeMessage}
              onChange={(e) => setChangeMessage(e.target.value)}
              placeholder="Describe the changes you'd like made to your placement..."
              className="w-full px-4 py-3 border border-border rounded-lg focus:border-amber-500 focus:outline-none text-sm mb-4"
              rows={4}
            />
            <div className="flex gap-3">
              <button
                onClick={handleRequestChanges}
                disabled={processing || !changeMessage.trim()}
                className="flex-1 bg-black text-white py-3 text-sm tracking-widest uppercase rounded-lg hover:bg-elevated transition-colors disabled:opacity-50"
              >
                {processing ? 'Sending...' : 'Submit Feedback'}
              </button>
              <button
                onClick={() => { setShowChanges(false); setChangeMessage(''); }}
                className="px-6 py-3 border border-border text-sm tracking-widest uppercase rounded-lg hover:border-border-strong transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 p-4 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
