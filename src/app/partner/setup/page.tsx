'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { resolveSearchQuery } from '@/lib/search-aliases';

interface Neighborhood {
  id: string;
  name: string;
  city: string;
  country: string;
}

interface Listing {
  address: string;
  price: string;
  beds?: string;
  baths?: string;
  sqft?: string;
  description?: string;
  photo_url?: string;
  link_url?: string;
}

interface PartnerRecord {
  id: string;
  agent_slug: string;
  status: string;
  neighborhood_id: string;
}

export default function PartnerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-canvas text-fg flex items-center justify-center">
        <p className="text-fg-muted">Loading...</p>
      </div>
    }>
      <PartnerPageInner />
    </Suspense>
  );
}

function PartnerPageInner() {
  const searchParams = useSearchParams();
  const activated = searchParams.get('activated') === 'true';

  // Step tracking
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1 - Neighborhood
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [search, setSearch] = useState('');
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<Neighborhood | null>(null);
  const [neighborhoodAvailable, setNeighborhoodAvailable] = useState<boolean | null>(null);
  const [checkingNeighborhood, setCheckingNeighborhood] = useState(false);

  // Step 2 - Agent details
  const [agentName, setAgentName] = useState('');
  const [agentTitle, setAgentTitle] = useState('');
  const [brokerageName, setBrokerageName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [agentPhotoUrl, setAgentPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Step 3 - Listings
  const [listings, setListings] = useState<Listing[]>([]);
  const [showListingForm, setShowListingForm] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing>({
    address: '', price: '',
  });
  const [uploadingListingPhoto, setUploadingListingPhoto] = useState(false);

  // Step 4 - Client emails
  const [clientEmails, setClientEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState('');

  // Step 5/6 - State
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerSlug, setPartnerSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendingPreview, setSendingPreview] = useState(false);
  const [previewSent, setPreviewSent] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState('');

  // Load neighborhoods
  useEffect(() => {
    fetch('/api/neighborhoods')
      .then((r) => r.json())
      .then((data) => {
        const items = (data.neighborhoods || data || [])
          .filter((n: Neighborhood & { is_active?: boolean }) => n.is_active !== false)
          .sort((a: Neighborhood, b: Neighborhood) => a.name.localeCompare(b.name));
        setNeighborhoods(items);
      })
      .catch(() => {});
  }, []);

  // Check neighborhood availability
  const checkNeighborhood = useCallback(async (id: string) => {
    setCheckingNeighborhood(true);
    try {
      const res = await fetch(`/api/partner/check-neighborhood?id=${id}`);
      const data = await res.json();
      setNeighborhoodAvailable(data.available);
    } catch {
      setNeighborhoodAvailable(null);
    }
    setCheckingNeighborhood(false);
  }, []);

  const handleSelectNeighborhood = (n: Neighborhood) => {
    setSelectedNeighborhood(n);
    setNeighborhoodAvailable(null);
    checkNeighborhood(n.id);
  };

  // Filter neighborhoods with fuzzy matching
  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q || q.length < 2) return neighborhoods;
    const results = resolveSearchQuery(q, neighborhoods);
    return results.map(r => r.item);
  }, [search, neighborhoods]);

  // Photo upload handler
  const handlePhotoUpload = async (file: File, callback: (url: string) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/partner/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) callback(data.url);
    } catch {
      setError('Failed to upload photo');
    }
  };

  // Add listing
  const addListing = () => {
    if (!editingListing.address || !editingListing.price) return;
    setListings([...listings, { ...editingListing }]);
    setEditingListing({ address: '', price: '' });
    setShowListingForm(false);
  };

  // Add single email
  const addEmail = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (trimmed && trimmed.includes('@') && !clientEmails.includes(trimmed)) {
      setClientEmails([...clientEmails, trimmed]);
    }
    setEmailInput('');
  };

  // Add bulk emails
  const addBulkEmails = () => {
    const newEmails = bulkInput
      .split(/[\n,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@') && !clientEmails.includes(e));
    setClientEmails([...clientEmails, ...newEmails]);
    setBulkInput('');
    setBulkMode(false);
  };

  // Save to backend
  const savePartner = async () => {
    if (!selectedNeighborhood || !agentName || !agentEmail) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/partner/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName,
          agentTitle: agentTitle || undefined,
          agentEmail,
          agentPhone: agentPhone || undefined,
          agentPhotoUrl: agentPhotoUrl || undefined,
          brokerageName: brokerageName || undefined,
          neighborhoodId: selectedNeighborhood.id,
          listings,
          clientEmails,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save');
        setSaving(false);
        return;
      }
      const p = data.partner as PartnerRecord;
      setPartnerId(p.id);
      setPartnerSlug(p.agent_slug);
      setSaving(false);
      return p;
    } catch {
      setError('Failed to save');
      setSaving(false);
      return null;
    }
  };

  // Advance step (save first if needed)
  const handleContinue = async () => {
    if (currentStep >= 4) {
      const p = await savePartner();
      if (p) setCurrentStep(currentStep + 1);
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  // Send preview
  const sendPreview = async () => {
    let pid = partnerId;
    if (!pid) {
      const p = await savePartner();
      if (!p) return;
      pid = p.id;
    }
    setSendingPreview(true);
    try {
      const res = await fetch('/api/partner/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentPartnerId: pid }),
      });
      if (res.ok) {
        setPreviewSent(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to send preview');
      }
    } catch {
      setError('Failed to send preview');
    }
    setSendingPreview(false);
  };

  // Checkout
  const handleCheckout = async () => {
    let pid = partnerId;
    if (!pid) {
      const p = await savePartner();
      if (!p) return;
      pid = p.id;
    }
    setCheckingOut(true);
    try {
      const res = await fetch('/api/partner/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentPartnerId: pid }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to create checkout session');
        setCheckingOut(false);
      }
    } catch {
      setError('Failed to start checkout');
      setCheckingOut(false);
    }
  };

  // Auto-generate slug preview
  const slugPreview = agentName && selectedNeighborhood
    ? `${agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${selectedNeighborhood.id.replace(/[^a-z0-9]+/g, '-')}`
    : '';

  // Activated state
  if (activated) {
    return (
      <div className="min-h-screen bg-canvas text-fg flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-[family-name:var(--font-cormorant)] text-4xl mb-4">You&apos;re Live</h1>
          <p className="text-fg-muted mb-6">
            Your branded newsletter is now active. Your clients will receive their first edition tomorrow morning at 7 AM.
          </p>
          <p className="text-fg-subtle text-sm">
            Share your subscribe link:{' '}
            <span className="text-accent font-medium">readflaneur.com/r/{partnerSlug || '...'}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <div className="max-w-[640px] mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs tracking-[0.3em] uppercase text-fg-subtle mb-4">
            Partner with Flaneur
          </p>
          <h1 className="font-[family-name:var(--font-cormorant)] text-3xl md:text-4xl font-light mb-3">
            Put Your Name on a Daily Neighborhood Newsletter
          </h1>
          <p className="text-fg-muted text-sm">
            Exclusive to one agent per neighborhood.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <button
              key={s}
              onClick={() => s < currentStep && setCurrentStep(s)}
              className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                s === currentStep
                  ? 'bg-fg text-canvas'
                  : s < currentStep
                  ? 'bg-accent/20 text-accent cursor-pointer'
                  : 'bg-surface text-fg-subtle'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Step 1 - Choose Neighborhood */}
        {currentStep === 1 && (
          <div>
            <h2 className="font-[family-name:var(--font-cormorant)] text-xl mb-4">Choose Your Neighborhood</h2>
            <input
              type="text"
              placeholder="Search neighborhoods..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-fg placeholder:text-fg-subtle mb-4 focus:outline-none focus:border-accent"
            />
            <div className="max-h-[300px] overflow-y-auto border border-border rounded-lg">
              {filtered.slice(0, 50).map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleSelectNeighborhood(n)}
                  className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-hover transition-colors ${
                    selectedNeighborhood?.id === n.id ? 'bg-accent/10' : ''
                  }`}
                >
                  <span className="font-medium">{n.name}</span>
                  <span className="text-fg-muted text-sm ml-2">{n.city}, {n.country}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-4 py-6 text-fg-subtle text-center text-sm">No neighborhoods found</p>
              )}
            </div>

            {selectedNeighborhood && (
              <div className="mt-4 p-4 bg-surface border border-border rounded-lg">
                {checkingNeighborhood ? (
                  <p className="text-fg-muted text-sm">Checking availability...</p>
                ) : neighborhoodAvailable === false ? (
                  <p className="text-red-400 text-sm">This neighborhood is taken. Choose another.</p>
                ) : neighborhoodAvailable === true ? (
                  <div>
                    <p className="text-sm text-fg-muted">
                      Your clients will receive <span className="text-fg font-medium">{selectedNeighborhood.name} Daily</span> every morning at 7 AM.
                    </p>
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="mt-3 bg-fg text-canvas px-6 py-2.5 text-sm font-medium tracking-wide uppercase hover:opacity-90 transition-opacity rounded-lg"
                    >
                      Continue
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* Step 2 - Your Details */}
        {currentStep === 2 && (
          <div>
            <h2 className="font-[family-name:var(--font-cormorant)] text-xl mb-4">Your Details</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs tracking-wide uppercase text-fg-subtle mb-1.5">Name *</label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="James Chen"
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs tracking-wide uppercase text-fg-subtle mb-1.5">Title</label>
                <input
                  type="text"
                  value={agentTitle}
                  onChange={(e) => setAgentTitle(e.target.value)}
                  placeholder="Licensed Associate Broker"
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs tracking-wide uppercase text-fg-subtle mb-1.5">Brokerage</label>
                <input
                  type="text"
                  value={brokerageName}
                  onChange={(e) => setBrokerageName(e.target.value)}
                  placeholder="Sotheby's International Realty"
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs tracking-wide uppercase text-fg-subtle mb-1.5">Email *</label>
                <input
                  type="email"
                  value={agentEmail}
                  onChange={(e) => setAgentEmail(e.target.value)}
                  placeholder="james@sothebys.com"
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs tracking-wide uppercase text-fg-subtle mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={agentPhone}
                  onChange={(e) => setAgentPhone(e.target.value)}
                  placeholder="212-555-0199"
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs tracking-wide uppercase text-fg-subtle mb-1.5">Profile Photo</label>
                {agentPhotoUrl && (
                  <img src={agentPhotoUrl} alt="Agent" className="w-16 h-16 rounded-full object-cover mb-2" />
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingPhoto(true);
                    await handlePhotoUpload(file, setAgentPhotoUrl);
                    setUploadingPhoto(false);
                  }}
                  className="text-sm text-fg-muted"
                />
                {uploadingPhoto && <p className="text-xs text-fg-subtle mt-1">Uploading...</p>}
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setCurrentStep(1)}
                className="px-6 py-2.5 text-sm border border-border rounded-lg text-fg-muted hover:text-fg transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => agentName && agentEmail && setCurrentStep(3)}
                disabled={!agentName || !agentEmail}
                className="bg-fg text-canvas px-6 py-2.5 text-sm font-medium tracking-wide uppercase hover:opacity-90 transition-opacity rounded-lg disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3 - Listings */}
        {currentStep === 3 && (
          <div>
            <h2 className="font-[family-name:var(--font-cormorant)] text-xl mb-2">Your Listings</h2>
            <p className="text-fg-muted text-sm mb-4">Optional - add up to 3 featured listings that appear in each email. You can change these later.</p>

            {listings.map((listing, i) => (
              <div key={i} className="border border-border rounded-lg p-4 mb-3 bg-surface">
                {listing.photo_url && (
                  <img src={listing.photo_url} alt={listing.address} className="w-full h-32 object-cover rounded-lg mb-3" />
                )}
                <p className="font-medium">{listing.address}</p>
                <p className="text-accent font-semibold">{listing.price}</p>
                {(listing.beds || listing.baths || listing.sqft) && (
                  <p className="text-fg-muted text-sm">
                    {[listing.beds && `${listing.beds} BD`, listing.baths && `${listing.baths} BA`, listing.sqft && `${listing.sqft} SF`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                {listing.description && <p className="text-fg-subtle text-sm mt-1">{listing.description}</p>}
                <button
                  onClick={() => setListings(listings.filter((_, idx) => idx !== i))}
                  className="text-red-400 text-xs mt-2 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}

            {showListingForm ? (
              <div className="border border-border rounded-lg p-4 bg-surface space-y-3">
                <input
                  type="text"
                  placeholder="Address *"
                  value={editingListing.address}
                  onChange={(e) => setEditingListing({ ...editingListing, address: e.target.value })}
                  className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
                />
                <input
                  type="text"
                  placeholder="Price *"
                  value={editingListing.price}
                  onChange={(e) => setEditingListing({ ...editingListing, price: e.target.value })}
                  className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" placeholder="Beds" value={editingListing.beds || ''} onChange={(e) => setEditingListing({ ...editingListing, beds: e.target.value })} className="bg-canvas border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent" />
                  <input type="text" placeholder="Baths" value={editingListing.baths || ''} onChange={(e) => setEditingListing({ ...editingListing, baths: e.target.value })} className="bg-canvas border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent" />
                  <input type="text" placeholder="Sqft" value={editingListing.sqft || ''} onChange={(e) => setEditingListing({ ...editingListing, sqft: e.target.value })} className="bg-canvas border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent" />
                </div>
                <textarea
                  placeholder="Description (max 200 chars)"
                  maxLength={200}
                  value={editingListing.description || ''}
                  onChange={(e) => setEditingListing({ ...editingListing, description: e.target.value })}
                  className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent h-20 resize-none"
                />
                <input
                  type="url"
                  placeholder="Listing URL (optional)"
                  value={editingListing.link_url || ''}
                  onChange={(e) => setEditingListing({ ...editingListing, link_url: e.target.value })}
                  className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
                />
                <div>
                  <label className="text-xs text-fg-subtle">Listing photo</label>
                  {editingListing.photo_url && (
                    <img src={editingListing.photo_url} alt="" className="w-full h-24 object-cover rounded-lg mb-2 mt-1" />
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingListingPhoto(true);
                      await handlePhotoUpload(file, (url) => setEditingListing({ ...editingListing, photo_url: url }));
                      setUploadingListingPhoto(false);
                    }}
                    className="text-sm text-fg-muted"
                  />
                  {uploadingListingPhoto && <p className="text-xs text-fg-subtle mt-1">Uploading...</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={addListing} disabled={!editingListing.address || !editingListing.price} className="bg-fg text-canvas px-4 py-2 text-sm rounded-lg disabled:opacity-40">
                    Add
                  </button>
                  <button onClick={() => { setShowListingForm(false); setEditingListing({ address: '', price: '' }); }} className="text-fg-muted text-sm px-4 py-2">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              listings.length < 3 && (
                <button
                  onClick={() => setShowListingForm(true)}
                  className="w-full border border-dashed border-border rounded-lg py-3 text-fg-muted text-sm hover:border-accent hover:text-accent transition-colors"
                >
                  + Add a listing
                </button>
              )
            )}

            <div className="mt-6 flex gap-3">
              <button onClick={() => setCurrentStep(2)} className="px-6 py-2.5 text-sm border border-border rounded-lg text-fg-muted hover:text-fg transition-colors">
                Back
              </button>
              <button onClick={() => setCurrentStep(4)} className="bg-fg text-canvas px-6 py-2.5 text-sm font-medium tracking-wide uppercase hover:opacity-90 transition-opacity rounded-lg">
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 4 - Client Emails */}
        {currentStep === 4 && (
          <div>
            <h2 className="font-[family-name:var(--font-cormorant)] text-xl mb-2">Client Emails</h2>
            <p className="text-fg-muted text-sm mb-4">Add the email addresses of clients who should receive your branded newsletter.</p>

            {!bulkMode ? (
              <div className="flex gap-2 mb-4">
                <input
                  type="email"
                  placeholder="client@email.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addEmail()}
                  className="flex-1 bg-surface border border-border rounded-lg px-4 py-3 text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
                />
                <button onClick={addEmail} className="bg-fg text-canvas px-4 py-3 text-sm rounded-lg font-medium">
                  Add
                </button>
              </div>
            ) : (
              <div className="mb-4">
                <textarea
                  placeholder="Paste emails - one per line, or comma/semicolon separated"
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent h-32 resize-none mb-2"
                />
                <div className="flex gap-2">
                  <button onClick={addBulkEmails} className="bg-fg text-canvas px-4 py-2 text-sm rounded-lg">
                    Add all
                  </button>
                  <button onClick={() => setBulkMode(false)} className="text-fg-muted text-sm px-4 py-2">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setBulkMode(!bulkMode)}
              className="text-accent text-xs mb-4 hover:underline"
            >
              {bulkMode ? 'Add one at a time' : 'Bulk paste emails'}
            </button>

            {clientEmails.length > 0 && (
              <div className="border border-border rounded-lg p-4 bg-surface mb-4">
                <p className="text-sm font-medium mb-2">{clientEmails.length} client{clientEmails.length !== 1 ? 's' : ''} will receive your newsletter</p>
                <div className="max-h-[200px] overflow-y-auto space-y-1">
                  {clientEmails.map((email, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <span className="text-fg-muted">{email}</span>
                      <button
                        onClick={() => setClientEmails(clientEmails.filter((_, idx) => idx !== i))}
                        className="text-red-400 text-xs hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {slugPreview && (
              <div className="p-3 bg-surface border border-border rounded-lg mb-4">
                <p className="text-xs text-fg-subtle mb-1">Your subscribe link</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={`readflaneur.com/r/${slugPreview}`}
                    className="flex-1 bg-canvas border border-border rounded px-3 py-1.5 text-sm text-fg font-mono"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(`https://readflaneur.com/r/${slugPreview}`)}
                    className="text-accent text-xs hover:underline shrink-0"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-fg-subtle mt-1">Clients can also subscribe via this link.</p>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button onClick={() => setCurrentStep(3)} className="px-6 py-2.5 text-sm border border-border rounded-lg text-fg-muted hover:text-fg transition-colors">
                Back
              </button>
              <button
                onClick={handleContinue}
                disabled={saving}
                className="bg-fg text-canvas px-6 py-2.5 text-sm font-medium tracking-wide uppercase hover:opacity-90 transition-opacity rounded-lg disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Step 5 - Preview */}
        {currentStep === 5 && (
          <div>
            <h2 className="font-[family-name:var(--font-cormorant)] text-xl mb-4">Preview Your Newsletter</h2>
            <p className="text-fg-muted text-sm mb-6">
              Send yourself a preview to see exactly what your clients will receive.
            </p>

            {previewSent ? (
              <div className="p-4 bg-accent/10 border border-accent/20 rounded-lg mb-6">
                <p className="text-sm text-fg">Preview sent to <span className="font-medium">{agentEmail}</span>. Check your inbox.</p>
              </div>
            ) : (
              <button
                onClick={sendPreview}
                disabled={sendingPreview}
                className="bg-fg text-canvas px-6 py-3 text-sm font-medium tracking-wide uppercase hover:opacity-90 transition-opacity rounded-lg disabled:opacity-40 mb-6"
              >
                {sendingPreview ? 'Sending...' : 'Send me a preview'}
              </button>
            )}

            <div className="mt-6 flex gap-3">
              <button onClick={() => setCurrentStep(4)} className="px-6 py-2.5 text-sm border border-border rounded-lg text-fg-muted hover:text-fg transition-colors">
                Back
              </button>
              <button
                onClick={() => setCurrentStep(6)}
                className="bg-fg text-canvas px-6 py-2.5 text-sm font-medium tracking-wide uppercase hover:opacity-90 transition-opacity rounded-lg"
              >
                Continue to Activation
              </button>
            </div>
          </div>
        )}

        {/* Step 6 - Activate */}
        {currentStep === 6 && (
          <div className="text-center">
            <h2 className="font-[family-name:var(--font-cormorant)] text-2xl mb-4">Activate Your Newsletter</h2>
            <div className="p-6 bg-surface border border-border rounded-lg mb-6 max-w-sm mx-auto">
              <p className="text-3xl font-light mb-1">$999</p>
              <p className="text-fg-muted text-sm">per month - cancel anytime</p>
            </div>
            <ul className="text-sm text-fg-muted space-y-2 mb-8 max-w-sm mx-auto text-left">
              <li>- Your name and branding on every email</li>
              <li>- Exclusive to your neighborhood - no other agents</li>
              <li>- Featured property listings in every edition</li>
              <li>- Personal subscribe link for your clients</li>
              <li>- Content generated daily by Flaneur</li>
            </ul>
            <button
              onClick={handleCheckout}
              disabled={checkingOut}
              className="bg-fg text-canvas px-8 py-3 text-sm font-medium tracking-wider uppercase hover:opacity-90 transition-opacity rounded-lg disabled:opacity-40"
            >
              {checkingOut ? 'Redirecting to Stripe...' : 'Activate'}
            </button>
            <div className="mt-4">
              <button onClick={() => setCurrentStep(5)} className="text-fg-muted text-sm hover:text-fg">
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
