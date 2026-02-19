'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AGE_BAND_DEFS, calculateAgeBand } from '@/lib/childcare/age-bands';

interface Neighborhood {
  id: string;
  name: string;
  city: string;
  region?: string;
  is_combo?: boolean;
  combo_component_names?: string[];
}

interface ChildEntry {
  birth_month: number;
  birth_year: number;
}

interface PreferencesData {
  email: string;
  source: string;
  daily_email_enabled: boolean;
  sunday_edition_enabled: boolean;
  neighborhood_ids: string[];
  neighborhoods: Neighborhood[];
  primary_city: string | null;
  all_neighborhoods: Neighborhood[];
  paused_topics: string[];
  childcare_mode_enabled: boolean;
  children: (ChildEntry & { id: string; display_order: number })[];
}

interface TopicDef {
  label: string;
  description: string;
}

const TOPIC_GROUPS: { group: string; topics: TopicDef[] }[] = [
  {
    group: 'Dining & Lifestyle',
    topics: [
      { label: 'Dining Watch', description: 'Restaurant reviews and openings' },
      { label: 'Al Fresco Alert', description: 'New outdoor dining and sidewalk seating' },
      { label: 'Scene Watch', description: 'Luxury brand pop-ups at seasonal hotspots' },
    ],
  },
  {
    group: 'Arts & Culture',
    topics: [
      { label: 'Culture Watch', description: 'Museum blockbuster exhibitions and previews' },
      { label: 'Art Fair', description: 'Coverage of major art fairs worldwide' },
      { label: 'Curtain Up', description: 'Opera, ballet, and symphony premieres' },
    ],
  },
  {
    group: 'Shopping & Fashion',
    topics: [
      { label: 'Retail Watch', description: 'New luxury retail openings' },
      { label: 'Style Alert', description: 'Designer sample sales and flash sales' },
      { label: 'Archive Alert', description: 'Vintage luxury finds at consignment stores' },
      { label: 'Runway Watch', description: 'Fashion week coverage' },
      { label: 'Design Week', description: 'Design week events (Salone, LDF, etc.)' },
    ],
  },
  {
    group: 'Auctions',
    topics: [
      { label: 'Auction Alert', description: 'Major auction house sales' },
      { label: 'Local Gavel', description: 'Regional auction houses' },
    ],
  },
  {
    group: 'Travel',
    topics: [
      { label: 'Escape Index', description: 'Weekend getaway conditions' },
      { label: 'Flight Check', description: 'New direct premium flight routes' },
    ],
  },
  {
    group: 'Civic & Community',
    topics: [
      { label: 'Heritage Watch', description: 'Landmark and preservation alerts' },
      { label: 'Community Watch', description: 'Quality-of-life issue reports' },
      { label: 'Social Calendar', description: 'Charity galas and society events' },
      { label: 'Civic Alert', description: 'Community board meeting controversies' },
      { label: 'Set Life', description: 'Film and TV production in your neighborhood' },
    ],
  },
];

function PreferencesContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const action = searchParams.get('action');

  const [data, setData] = useState<PreferencesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const [frequencySaved, setFrequencySaved] = useState(false);
  const [pausedTopics, setPausedTopics] = useState<string[]>([]);
  const [topicsSaving, setTopicsSaving] = useState(false);
  const [topicsSaved, setTopicsSaved] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [suggestionSending, setSuggestionSending] = useState(false);
  const [suggestionSent, setSuggestionSent] = useState(false);
  const [emailResendNote, setEmailResendNote] = useState<string | null>(null);
  const [sundayEditionSaved, setSundayEditionSaved] = useState(false);
  const [childcareEnabled, setChildcareEnabled] = useState(false);
  const [childcareSaved, setChildcareSaved] = useState(false);
  const [childrenList, setChildrenList] = useState<ChildEntry[]>([]);
  const [childrenSaving, setChildrenSaving] = useState(false);
  const [childrenSaved, setChildrenSaved] = useState(false);
  const [highlightFamily, setHighlightFamily] = useState(false);
  const familyCornerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!token) {
      setError('Missing authentication token. Please use the link from your email.');
      setLoading(false);
      return;
    }

    fetch(`/api/email/preferences?token=${token}`)
      .then(res => {
        if (!res.ok) throw new Error('Invalid or expired token');
        return res.json();
      })
      .then((d: PreferencesData) => {
        setData(d);
        setSelectedIds(d.neighborhood_ids);
        setPausedTopics(d.paused_topics || []);
        setChildcareEnabled(d.childcare_mode_enabled || false);
        setChildrenList((d.children || []).map(c => ({ birth_month: c.birth_month, birth_year: c.birth_year })));
        // Sync family corner state to localStorage for house ad suppression
        try {
          if (d.childcare_mode_enabled) {
            localStorage.setItem('flaneur-family-corner-enabled', 'true');
          }
        } catch { /* ignore */ }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  // Scroll to and highlight Family Corner when navigating via #family-corner hash
  useEffect(() => {
    if (!loading && data && typeof window !== 'undefined' && window.location.hash === '#family-corner') {
      setHighlightFamily(true);
      setTimeout(() => {
        familyCornerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
      setTimeout(() => setHighlightFamily(false), 3000);
    }
  }, [loading, data]);

  const handleRemove = (id: string) => {
    setSelectedIds(prev => prev.filter(n => n !== id));
    setSaved(false);
  };

  const handleAdd = (id: string) => {
    if (!selectedIds.includes(id)) {
      setSelectedIds(prev => [...prev, id]);
      setSaved(false);
    }
    setShowAddModal(false);
    setSearch('');
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setSaved(false);
    setEmailResendNote(null);

    try {
      const res = await fetch('/api/email/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'update_neighborhoods',
          neighborhood_ids: selectedIds,
        }),
      });

      if (res.ok) {
        setSaved(true);
        const result = await res.json();
        if (result.emailResend === 'sending') {
          setEmailResendNote('A fresh Daily Brief reflecting your changes is on its way.');
        } else if (result.emailResend === 'rate_limited') {
          setEmailResendNote('To save your inbox, your changes will be reflected in tomorrow morning\'s email.');
        }
        setTimeout(() => setEmailResendNote(null), 8000);
      }
    } catch {
      // Error saving
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEmail = async (enabled: boolean) => {
    if (!token) return;
    setSaving(true);
    setFrequencySaved(false);

    try {
      await fetch('/api/email/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'update_email_enabled',
          daily_email_enabled: enabled,
        }),
      });

      setData(prev => prev ? { ...prev, daily_email_enabled: enabled } : prev);
      setFrequencySaved(true);
    } catch {
      // Error saving
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSundayEdition = async (enabled: boolean) => {
    if (!token) return;
    setSaving(true);
    setSundayEditionSaved(false);

    try {
      await fetch('/api/email/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'update_sunday_edition',
          sunday_edition_enabled: enabled,
        }),
      });

      setData(prev => prev ? { ...prev, sunday_edition_enabled: enabled } : prev);
      setSundayEditionSaved(true);
    } catch {
      // Error saving
    } finally {
      setSaving(false);
    }
  };

  const toggleTopic = (label: string) => {
    setPausedTopics(prev =>
      prev.includes(label)
        ? prev.filter(t => t !== label)
        : [...prev, label]
    );
    setTopicsSaved(false);
  };

  const handleSaveTopics = async () => {
    if (!token) return;
    setTopicsSaving(true);
    setTopicsSaved(false);
    setEmailResendNote(null);

    try {
      const res = await fetch('/api/email/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'update_topics',
          paused_topics: pausedTopics,
        }),
      });

      if (res.ok) {
        setTopicsSaved(true);
        setData(prev => prev ? { ...prev, paused_topics: pausedTopics } : prev);
        const result = await res.json();
        if (result.emailResend === 'sending') {
          setEmailResendNote('A fresh Daily Brief reflecting your changes is on its way.');
        } else if (result.emailResend === 'rate_limited') {
          setEmailResendNote('To save your inbox, your changes will be reflected in tomorrow morning\'s email.');
        }
        setTimeout(() => setEmailResendNote(null), 8000);
      }
    } catch {
      // Error saving
    } finally {
      setTopicsSaving(false);
    }
  };

  const handleSuggestTopic = async () => {
    if (!token || !suggestion.trim()) return;
    setSuggestionSending(true);

    try {
      const res = await fetch('/api/email/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'suggest_topic',
          suggestion: suggestion.trim(),
        }),
      });

      if (res.ok) {
        setSuggestionSent(true);
        setSuggestion('');
        setTimeout(() => setSuggestionSent(false), 3000);
      }
    } catch {
      // Error sending
    } finally {
      setSuggestionSending(false);
    }
  };

  const handleToggleChildcare = async (enabled: boolean) => {
    if (!token) return;
    setSaving(true);
    setChildcareSaved(false);

    try {
      await fetch('/api/email/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'update_childcare_mode',
          childcare_mode_enabled: enabled,
        }),
      });

      setChildcareEnabled(enabled);
      setData(prev => prev ? { ...prev, childcare_mode_enabled: enabled } : prev);
      setChildcareSaved(true);
      // Sync to localStorage so house ad suppression works
      try {
        if (enabled) {
          localStorage.setItem('flaneur-family-corner-enabled', 'true');
        } else {
          localStorage.removeItem('flaneur-family-corner-enabled');
        }
      } catch { /* ignore */ }
    } catch {
      // Error saving
    } finally {
      setSaving(false);
    }
  };

  const handleAddChild = () => {
    if (childrenList.length >= 4) return;
    const now = new Date();
    setChildrenList(prev => [...prev, { birth_month: now.getMonth() + 1, birth_year: now.getFullYear() }]);
    setChildrenSaved(false);
  };

  const handleRemoveChild = (index: number) => {
    setChildrenList(prev => prev.filter((_, i) => i !== index));
    setChildrenSaved(false);
  };

  const handleChildChange = (index: number, field: 'birth_month' | 'birth_year', value: number) => {
    setChildrenList(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
    setChildrenSaved(false);
  };

  const handleSaveChildren = async () => {
    if (!token) return;
    setChildrenSaving(true);
    setChildrenSaved(false);

    try {
      const res = await fetch('/api/email/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'update_children',
          children: childrenList,
        }),
      });

      if (res.ok) {
        setChildrenSaved(true);
      }
    } catch {
      // Error saving
    } finally {
      setChildrenSaving(false);
    }
  };

  const hasChildrenChanges = data
    ? JSON.stringify(childrenList) !== JSON.stringify((data.children || []).map(c => ({ birth_month: c.birth_month, birth_year: c.birth_year })))
    : false;

  const hasTopicChanges = data
    ? JSON.stringify([...pausedTopics].sort()) !== JSON.stringify([...(data.paused_topics || [])].sort())
    : false;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-neutral-400 text-sm">Loading preferences...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <h1 className="text-xl font-light tracking-[0.15em] mb-6">FLANEUR</h1>
        <p className="text-neutral-500 text-sm">{error}</p>
        <Link href="/" className="mt-4 text-sm underline">Return to Flaneur</Link>
      </div>
    );
  }

  if (!data) return null;

  const selectedNeighborhoods = (data.all_neighborhoods || []).filter(n =>
    selectedIds.includes(n.id)
  );

  // Group available neighborhoods by city for the add modal
  const availableNeighborhoods = (data.all_neighborhoods || []).filter(
    n => !selectedIds.includes(n.id)
  );

  const filteredAvailable = search
    ? availableNeighborhoods.filter(n =>
        n.name.toLowerCase().includes(search.toLowerCase()) ||
        n.city.toLowerCase().includes(search.toLowerCase())
      )
    : availableNeighborhoods;

  const groupedAvailable: Record<string, Neighborhood[]> = {};
  for (const n of filteredAvailable) {
    const city = n.city || 'Other';
    if (!groupedAvailable[city]) groupedAvailable[city] = [];
    groupedAvailable[city].push(n);
  }

  const hasChanges = JSON.stringify(selectedIds.sort()) !== JSON.stringify(data.neighborhood_ids.sort());

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <div className="border-b border-white/[0.08] px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-light tracking-[0.15em] text-neutral-100">
            FLANEUR
          </Link>
          <span className="text-xs text-neutral-400">{data.email}</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold text-neutral-100 mb-1">Email Preferences</h1>
        <p className="text-sm text-neutral-500 mb-8">
          Manage your Daily Brief neighborhoods and email settings.
        </p>

        {/* Email frequency */}
        <section className="mb-8">
          <h2 className="text-xs font-medium tracking-[0.1em] uppercase text-neutral-400 mb-3">
            Email Frequency
          </h2>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 border border-white/[0.08] rounded-lg cursor-pointer hover:border-white/20 transition-colors">
              <input
                type="radio"
                name="frequency"
                checked={data.daily_email_enabled === true}
                onChange={() => handleToggleEmail(true)}
                className="accent-amber-600"
              />
              <div>
                <div className="text-sm font-medium text-neutral-200">Daily Brief</div>
                <div className="text-xs text-neutral-500">Every morning at 7 AM your time</div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 border border-white/[0.08] rounded-lg cursor-pointer hover:border-white/20 transition-colors">
              <input
                type="radio"
                name="frequency"
                checked={data.daily_email_enabled === false}
                onChange={() => handleToggleEmail(false)}
                className="accent-amber-600"
              />
              <div>
                <div className="text-sm font-medium text-neutral-200">Paused</div>
                <div className="text-xs text-neutral-500">No emails (you can re-enable anytime)</div>
              </div>
            </label>
          </div>
          {frequencySaved && (
            <p className="text-xs text-green-600 mt-2">Preference saved!</p>
          )}
        </section>

        {/* Sunday Edition */}
        <section className="mb-8">
          <h2 className="text-xs font-medium tracking-[0.1em] uppercase text-neutral-400 mb-3">
            The Sunday Edition
          </h2>
          <p className="text-xs text-neutral-400 mb-3">
            A weekly digest every Sunday at 7 AM with the past week in review and the week ahead.
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 border border-white/[0.08] rounded-lg cursor-pointer hover:border-white/20 transition-colors">
              <input
                type="radio"
                name="sunday_edition"
                checked={data.sunday_edition_enabled === true}
                onChange={() => handleToggleSundayEdition(true)}
                className="accent-amber-600"
              />
              <div>
                <div className="text-sm font-medium text-neutral-200">Enabled</div>
                <div className="text-xs text-neutral-500">Receive The Sunday Edition weekly</div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 border border-white/[0.08] rounded-lg cursor-pointer hover:border-white/20 transition-colors">
              <input
                type="radio"
                name="sunday_edition"
                checked={data.sunday_edition_enabled === false}
                onChange={() => handleToggleSundayEdition(false)}
                className="accent-amber-600"
              />
              <div>
                <div className="text-sm font-medium text-neutral-200">Paused</div>
                <div className="text-xs text-neutral-500">No Sunday Edition emails</div>
              </div>
            </label>
          </div>
          {sundayEditionSaved && (
            <p className="text-xs text-green-600 mt-2">Preference saved!</p>
          )}
        </section>

        {/* Family Corner */}
        <section
          ref={familyCornerRef}
          id="family-corner"
          className={`mb-8 -mx-4 px-4 py-4 rounded-lg transition-colors duration-1000 ${highlightFamily ? 'bg-amber-500/10' : ''}`}
        >
          <h2 className="text-xs font-medium tracking-[0.1em] uppercase text-neutral-400 mb-3">
            Family Corner
          </h2>
          <p className="text-xs text-neutral-400 mb-3">
            Enabling Family Corner adds a family section to your Daily Brief with local kids&apos; events, school news, and family resources tailored to your children&apos;s ages.
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 border border-white/[0.08] rounded-lg cursor-pointer hover:border-white/20 transition-colors">
              <input
                type="radio"
                name="childcare"
                checked={childcareEnabled === true}
                onChange={() => handleToggleChildcare(true)}
                className="accent-amber-600"
              />
              <div>
                <div className="text-sm font-medium text-neutral-200">Enabled</div>
                <div className="text-xs text-neutral-500">Show Family Corner in my Daily Brief</div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 border border-white/[0.08] rounded-lg cursor-pointer hover:border-white/20 transition-colors">
              <input
                type="radio"
                name="childcare"
                checked={childcareEnabled === false}
                onChange={() => handleToggleChildcare(false)}
                className="accent-amber-600"
              />
              <div>
                <div className="text-sm font-medium text-neutral-200">
                  {(data.children || []).length > 0 || (childrenSaved && childrenList.length > 0) ? 'Paused' : 'Disabled'}
                </div>
                <div className="text-xs text-neutral-500">
                  {(data.children || []).length > 0 || (childrenSaved && childrenList.length > 0)
                    ? 'Family Corner paused — your children\u2019s details are saved'
                    : 'No family content'}
                </div>
              </div>
            </label>
          </div>
          {childcareSaved && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${
              childcareEnabled
                ? 'bg-green-950/20 border border-green-800/30 text-green-400'
                : 'bg-neutral-800/50 border border-white/[0.08] text-neutral-400'
            }`}>
              {childcareEnabled
                ? '\u2713 Family Corner enabled! Add your children below to personalize content.'
                : (data.children || []).length > 0 || childrenList.length > 0
                  ? '\u2713 Family Corner paused. Your children\u2019s details are still saved.'
                  : '\u2713 Family Corner disabled.'}
            </div>
          )}

          {childcareEnabled && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-neutral-500">Your Children</h3>
                {childrenList.length < 4 && (
                  <button
                    onClick={handleAddChild}
                    className="text-xs bg-white text-neutral-900 px-3 py-1 tracking-wider uppercase hover:bg-neutral-200 transition-colors rounded-lg"
                  >
                    + Add Child
                  </button>
                )}
              </div>

              {childrenList.length === 0 ? (
                <div className="py-3 text-center border border-dashed border-white/[0.08] rounded-lg px-4">
                  <p className="text-sm text-neutral-400">Add your children to get started.</p>
                  <p className="text-xs text-neutral-500 mt-1">
                    Family Corner content is tailored by age — add at least one child to see local kids&apos; events and family resources in your Daily Brief.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {childrenList.map((child, i) => (
                    <div key={i} className="flex items-center gap-2 p-3 border border-white/[0.08] rounded-lg">
                      <span className="text-xs text-neutral-400 flex-shrink-0">Child {i + 1}:</span>
                      <select
                        value={child.birth_month}
                        onChange={e => handleChildChange(i, 'birth_month', parseInt(e.target.value))}
                        className="flex-1 px-2 py-1 border border-white/20 rounded text-sm bg-neutral-900 text-white"
                      >
                        {Array.from({ length: 12 }, (_, m) => (
                          <option key={m + 1} value={m + 1}>
                            {new Date(2000, m).toLocaleString('en', { month: 'long' })}
                          </option>
                        ))}
                      </select>
                      <select
                        value={child.birth_year}
                        onChange={e => handleChildChange(i, 'birth_year', parseInt(e.target.value))}
                        className="px-2 py-1 border border-white/20 rounded text-sm bg-neutral-900 text-white"
                      >
                        {Array.from({ length: 22 }, (_, y) => {
                          const year = 2006 + y;
                          return <option key={year} value={year}>{year}</option>;
                        })}
                      </select>
                      <button
                        onClick={() => handleRemoveChild(i)}
                        className="text-xs text-neutral-400 hover:text-red-600 transition-colors flex-shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {childrenList.length > 0 && (
                <div className="mt-3 p-3 border border-white/[0.06] rounded-lg bg-neutral-800/30">
                  <p className="text-xs text-neutral-500 mb-2">Your Daily Brief will include:</p>
                  {(() => {
                    const now = new Date();
                    const seen = new Set<string>();
                    return childrenList.map((child, i) => {
                      const band = calculateAgeBand(child.birth_month, child.birth_year, now);
                      if (!band || seen.has(band)) return null;
                      seen.add(band);
                      const def = AGE_BAND_DEFS.find(d => d.band === band);
                      if (!def) return null;
                      return (
                        <div key={i} className="text-xs text-neutral-400 mb-1">
                          <span className="text-neutral-300">{def.label}</span>
                          <span className="text-neutral-500"> — {def.contentFocus}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              {hasChildrenChanges && childrenList.length > 0 && (
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={handleSaveChildren}
                    disabled={childrenSaving}
                    className="bg-white text-neutral-900 px-6 py-2 text-xs tracking-widest uppercase hover:bg-neutral-200 transition-colors disabled:opacity-50 rounded-lg"
                  >
                    {childrenSaving ? 'Saving...' : 'Save Children Changes'}
                  </button>
                </div>
              )}

              {childrenSaved && !hasChildrenChanges && (
                <div className="mt-3 p-2.5 border border-green-800/30 rounded-lg bg-green-950/20">
                  <p className="text-sm text-green-400 font-medium">{'\u2713'} Children changes saved</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Subscribed neighborhoods */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-medium tracking-[0.1em] uppercase text-neutral-400">
              Your Neighborhoods ({selectedNeighborhoods.length})
            </h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-xs bg-white text-neutral-900 px-3 py-1.5 tracking-wider uppercase hover:bg-neutral-200 transition-colors rounded-lg"
            >
              + Add
            </button>
          </div>

          {selectedNeighborhoods.length === 0 ? (
            <p className="text-sm text-neutral-400 py-4 text-center border border-dashed border-white/[0.08] rounded-lg">
              No neighborhoods selected. Add some to get stories in your Daily Brief.
            </p>
          ) : (
            <div className="space-y-1">
              {selectedNeighborhoods.map(n => (
                <div
                  key={n.id}
                  className="flex items-center justify-between p-3 border border-white/[0.08] rounded-lg"
                >
                  <div>
                    <span className="text-sm font-medium text-neutral-200">{n.name}</span>
                    <span className="text-xs text-neutral-400 ml-2">{n.city}</span>
                    {n.combo_component_names && n.combo_component_names.length > 0 && (
                      <div className="text-xs text-neutral-300 mt-0.5">
                        Includes: {n.combo_component_names.join(', ')}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemove(n.id)}
                    className="text-xs text-neutral-400 hover:text-red-600 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {hasChanges && (
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-white text-neutral-900 px-6 py-2 text-xs tracking-widest uppercase hover:bg-neutral-200 transition-colors disabled:opacity-50 rounded-lg"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              {saved && (
                <span className="text-xs text-green-600">Preferences saved!</span>
              )}
            </div>
          )}

          {saved && !hasChanges && (
            <p className="text-xs text-green-600 mt-3">Preferences saved!</p>
          )}
          {emailResendNote && (saved || topicsSaved) && (
            <p className="text-xs text-neutral-500 italic mt-2">{emailResendNote}</p>
          )}
        </section>

        {/* Topic preferences */}
        <section className="mb-8">
          <h2 className="text-xs font-medium tracking-[0.1em] uppercase text-neutral-400 mb-1">
            Topics
          </h2>
          <p className="text-xs text-neutral-400 mb-4">
            Pause topics you don&apos;t want in your Daily Brief. Daily Brief is always included.
          </p>

          {TOPIC_GROUPS.map(({ group, topics }) => (
            <div key={group} className="mb-4">
              <h3 className="text-xs font-medium text-neutral-500 mb-2">{group}</h3>
              <div className="space-y-1">
                {topics.map(topic => {
                  const isPaused = pausedTopics.includes(topic.label);
                  return (
                    <button
                      key={topic.label}
                      onClick={() => toggleTopic(topic.label)}
                      className={`w-full flex items-center justify-between p-3 border rounded-lg transition-colors text-left ${
                        isPaused
                          ? 'border-white/[0.08] bg-white/5 text-neutral-500'
                          : 'border-white/[0.08] hover:border-white/20'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className={`text-sm font-medium ${isPaused ? 'text-neutral-500 line-through' : 'text-neutral-200'}`}>
                          {topic.label}
                        </div>
                        <div className="text-xs text-neutral-400">{topic.description}</div>
                      </div>
                      <span className={`ml-3 text-sm flex-shrink-0 ${isPaused ? 'text-neutral-300' : 'text-green-600'}`}>
                        {isPaused ? 'Paused' : '\u2713'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {hasTopicChanges && (
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleSaveTopics}
                disabled={topicsSaving}
                className="bg-white text-neutral-900 px-6 py-2 text-xs tracking-widest uppercase hover:bg-neutral-200 transition-colors disabled:opacity-50 rounded-lg"
              >
                {topicsSaving ? 'Saving...' : 'Save Topics'}
              </button>
              {topicsSaved && (
                <span className="text-xs text-green-600">Topics saved!</span>
              )}
            </div>
          )}

          {topicsSaved && !hasTopicChanges && (
            <p className="text-xs text-green-600 mt-3">Topics saved!</p>
          )}
          {emailResendNote && topicsSaved && (
            <p className="text-xs text-neutral-500 italic mt-2">{emailResendNote}</p>
          )}
        </section>

        {/* Suggest a topic */}
        <section className="mb-8">
          <h2 className="text-xs font-medium tracking-[0.1em] uppercase text-neutral-400 mb-3">
            Suggest a Topic
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={suggestion}
              onChange={e => setSuggestion(e.target.value)}
              placeholder="What topic would you like to see?"
              className="flex-1 px-3 py-2 border border-white/20 rounded-lg focus:border-amber-500 focus:outline-none text-sm bg-neutral-900 text-white"
              maxLength={200}
            />
            <button
              onClick={handleSuggestTopic}
              disabled={suggestionSending || !suggestion.trim()}
              className="bg-white text-neutral-900 px-4 py-2 text-xs tracking-widest uppercase hover:bg-neutral-200 transition-colors disabled:opacity-50 rounded-lg"
            >
              {suggestionSending ? '...' : 'Send'}
            </button>
          </div>
          {suggestionSent && (
            <p className="text-xs text-green-600 mt-2">Thanks! We&apos;ll consider your suggestion.</p>
          )}
        </section>

        {/* Back link */}
        <div className="border-t border-white/[0.08] pt-6">
          <Link href="/" className="text-sm text-neutral-500 hover:text-white transition-colors">
            &larr; Back to Flaneur
          </Link>
        </div>
      </div>

      {/* Add neighborhood modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-surface w-full sm:max-w-md sm:rounded-lg max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
              <h3 className="font-semibold text-sm text-neutral-100">Add Neighborhood</h3>
              <button
                onClick={() => { setShowAddModal(false); setSearch(''); }}
                className="text-neutral-400 hover:text-white text-lg"
              >
                &times;
              </button>
            </div>
            <div className="p-4 border-b border-white/[0.08]">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search neighborhoods..."
                className="w-full px-3 py-2 border border-white/20 rounded-lg focus:border-amber-500 focus:outline-none text-sm bg-neutral-900 text-white"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {Object.entries(groupedAvailable)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([city, neighborhoods]) => (
                  <div key={city} className="mb-4">
                    <h4 className="text-xs font-medium tracking-[0.08em] uppercase text-neutral-400 mb-2">
                      {city}
                    </h4>
                    <div className="space-y-1">
                      {neighborhoods.map(n => (
                        <button
                          key={n.id}
                          onClick={() => handleAdd(n.id)}
                          className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-white/5 border border-transparent hover:border-white/[0.08] rounded-lg transition-colors"
                        >
                          {n.name}
                          {n.combo_component_names && n.combo_component_names.length > 0 && (
                            <span className="text-xs text-neutral-300 ml-1.5">
                              ({n.combo_component_names.join(', ')})
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              {Object.keys(groupedAvailable).length === 0 && (
                <p className="text-sm text-neutral-400 text-center py-4">
                  No neighborhoods found.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmailPreferencesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-neutral-400 text-sm">Loading...</div>
      </div>
    }>
      <PreferencesContent />
    </Suspense>
  );
}
