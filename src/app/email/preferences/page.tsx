'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Neighborhood {
  id: string;
  name: string;
  city: string;
  region?: string;
}

interface PreferencesData {
  email: string;
  source: string;
  daily_email_enabled: boolean;
  neighborhood_ids: string[];
  neighborhoods: Neighborhood[];
  primary_city: string | null;
  all_neighborhoods: Neighborhood[];
  paused_topics: string[];
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
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

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
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-neutral-200 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-light tracking-[0.15em]">
            FLANEUR
          </Link>
          <span className="text-xs text-neutral-400">{data.email}</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold mb-1">Email Preferences</h1>
        <p className="text-sm text-neutral-500 mb-8">
          Manage your Daily Brief neighborhoods and email settings.
        </p>

        {/* Email frequency */}
        <section className="mb-8">
          <h2 className="text-xs font-medium tracking-[0.1em] uppercase text-neutral-400 mb-3">
            Email Frequency
          </h2>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 border border-neutral-200 cursor-pointer hover:border-neutral-400 transition-colors">
              <input
                type="radio"
                name="frequency"
                checked={data.daily_email_enabled === true}
                onChange={() => handleToggleEmail(true)}
                className="accent-black"
              />
              <div>
                <div className="text-sm font-medium">Daily Brief</div>
                <div className="text-xs text-neutral-500">Every morning at 7 AM your time</div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 border border-neutral-200 cursor-pointer hover:border-neutral-400 transition-colors">
              <input
                type="radio"
                name="frequency"
                checked={data.daily_email_enabled === false}
                onChange={() => handleToggleEmail(false)}
                className="accent-black"
              />
              <div>
                <div className="text-sm font-medium">Paused</div>
                <div className="text-xs text-neutral-500">No emails (you can re-enable anytime)</div>
              </div>
            </label>
          </div>
          {frequencySaved && (
            <p className="text-xs text-green-600 mt-2">Preference saved!</p>
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
              className="text-xs bg-black text-white px-3 py-1.5 tracking-wider uppercase hover:bg-neutral-800 transition-colors"
            >
              + Add
            </button>
          </div>

          {selectedNeighborhoods.length === 0 ? (
            <p className="text-sm text-neutral-400 py-4 text-center border border-dashed border-neutral-200">
              No neighborhoods selected. Add some to get stories in your Daily Brief.
            </p>
          ) : (
            <div className="space-y-1">
              {selectedNeighborhoods.map(n => (
                <div
                  key={n.id}
                  className="flex items-center justify-between p-3 border border-neutral-200"
                >
                  <div>
                    <span className="text-sm font-medium">{n.name}</span>
                    <span className="text-xs text-neutral-400 ml-2">{n.city}</span>
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
                className="bg-black text-white px-6 py-2 text-xs tracking-widest uppercase hover:bg-neutral-800 transition-colors disabled:opacity-50"
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
                      className={`w-full flex items-center justify-between p-3 border transition-colors text-left ${
                        isPaused
                          ? 'border-neutral-200 bg-neutral-50 text-neutral-400'
                          : 'border-neutral-200 hover:border-neutral-400'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className={`text-sm font-medium ${isPaused ? 'text-neutral-400 line-through' : ''}`}>
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
                className="bg-black text-white px-6 py-2 text-xs tracking-widest uppercase hover:bg-neutral-800 transition-colors disabled:opacity-50"
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
              className="flex-1 px-3 py-2 border border-neutral-200 focus:border-black focus:outline-none text-sm"
              maxLength={200}
            />
            <button
              onClick={handleSuggestTopic}
              disabled={suggestionSending || !suggestion.trim()}
              className="bg-black text-white px-4 py-2 text-xs tracking-widest uppercase hover:bg-neutral-800 transition-colors disabled:opacity-50"
            >
              {suggestionSending ? '...' : 'Send'}
            </button>
          </div>
          {suggestionSent && (
            <p className="text-xs text-green-600 mt-2">Thanks! We&apos;ll consider your suggestion.</p>
          )}
        </section>

        {/* Back link */}
        <div className="border-t border-neutral-200 pt-6">
          <Link href="/" className="text-sm text-neutral-500 hover:text-black transition-colors">
            &larr; Back to Flaneur
          </Link>
        </div>
      </div>

      {/* Add neighborhood modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md sm:rounded-lg max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <h3 className="font-semibold text-sm">Add Neighborhood</h3>
              <button
                onClick={() => { setShowAddModal(false); setSearch(''); }}
                className="text-neutral-400 hover:text-black text-lg"
              >
                &times;
              </button>
            </div>
            <div className="p-4 border-b border-neutral-200">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search neighborhoods..."
                className="w-full px-3 py-2 border border-neutral-200 focus:border-black focus:outline-none text-sm"
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
                          className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 border border-transparent hover:border-neutral-200 transition-colors"
                        >
                          {n.name}
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
