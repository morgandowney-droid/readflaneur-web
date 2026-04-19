'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

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

interface PartnerData {
  id: string;
  agent_name: string;
  agent_title: string | null;
  agent_email: string;
  agent_phone: string | null;
  agent_photo_url: string | null;
  brokerage_name: string | null;
  neighborhood_id: string;
  agent_slug: string;
  listings: Listing[];
  client_emails: string[];
  status: string;
  activated_at: string | null;
  created_at: string;
  stripe_customer_id: string | null;
  neighborhood: {
    id: string;
    name: string;
    city: string;
    country: string;
  };
}

export default function PartnerDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-canvas text-fg flex items-center justify-center">
        <p className="text-fg-muted">Loading...</p>
      </div>
    }>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<PartnerData | null>(null);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [error, setError] = useState('');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [sendingLink, setSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  // Verify token from magic link
  useEffect(() => {
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    if (token && email) {
      fetch(`/api/partner/auth/verify?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`)
        .then(async (res) => {
          if (res.ok) {
            setAuthenticated(true);
            // Strip token params from URL
            router.replace('/partner/dashboard');
          } else {
            const data = await res.json();
            setError(data.error || 'Invalid or expired link');
            setLoading(false);
          }
        })
        .catch(() => {
          setError('Failed to verify link');
          setLoading(false);
        });
    } else {
      // Check existing session
      fetchPartner();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch partner data when authenticated
  useEffect(() => {
    if (authenticated) {
      fetchPartner();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  const fetchPartner = useCallback(async () => {
    try {
      const res = await fetch('/api/partner/me');
      if (res.ok) {
        const data = await res.json();
        setPartner(data.partner);
        setSubscriberCount(data.subscriberCount || 0);
        setAuthenticated(true);
      } else {
        setAuthenticated(false);
      }
    } catch {
      setAuthenticated(false);
    }
    setLoading(false);
  }, []);

  const handleSendLink = async () => {
    if (!loginEmail || !loginEmail.includes('@')) return;
    setSendingLink(true);
    setError('');
    try {
      await fetch('/api/partner/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim().toLowerCase() }),
      });
      setLinkSent(true);
    } catch {
      setError('Failed to send sign-in link');
    }
    setSendingLink(false);
  };

  const handleSignOut = () => {
    document.cookie = 'flaneur-partner-session=; Max-Age=0; path=/';
    setAuthenticated(false);
    setPartner(null);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas text-fg flex items-center justify-center">
        <p className="text-fg-muted">Loading...</p>
      </div>
    );
  }

  // Login form
  if (!authenticated || !partner) {
    return (
      <div className="min-h-screen bg-canvas text-fg flex items-center justify-center px-4">
        <div className="max-w-sm w-full">
          <div className="text-center mb-8">
            <p className="text-xs tracking-[0.3em] uppercase text-fg-subtle mb-4">Partner Dashboard</p>
            <h1 className="font-[family-name:var(--font-cormorant)] text-3xl font-light">Sign In</h1>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          {linkSent ? (
            <div className="text-center">
              <p className="text-fg-muted mb-2">Check your inbox for a sign-in link.</p>
              <p className="text-fg-subtle text-sm">Sent to {loginEmail}</p>
              <button
                onClick={() => { setLinkSent(false); setLoginEmail(''); }}
                className="text-accent text-sm mt-4 hover:underline"
              >
                Try a different email
              </button>
            </div>
          ) : (
            <>
              <p className="text-fg-muted text-sm text-center mb-6">
                Enter the email you used to set up your partnership
              </p>
              <input
                type="email"
                placeholder="you@brokerage.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendLink()}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-fg placeholder:text-fg-subtle mb-4 focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleSendLink}
                disabled={sendingLink || !loginEmail.includes('@')}
                className="w-full bg-fg text-canvas px-6 py-3 text-sm font-medium tracking-wide uppercase hover:opacity-90 transition-opacity rounded-lg disabled:opacity-40"
              >
                {sendingLink ? 'Sending...' : 'Send sign-in link'}
              </button>
            </>
          )}

          <div className="text-center mt-8">
            <Link href="/partner" className="text-fg-subtle text-sm hover:text-fg transition-colors">
              Not a partner yet? Learn more
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://readflaneur.com';
  const subscribeLink = `${appUrl}/r/${partner.agent_slug}`;
  const totalClients = (partner.client_emails?.length || 0) + subscriberCount;
  const daysActive = partner.activated_at
    ? Math.floor((Date.now() - new Date(partner.activated_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <div className="max-w-[720px] mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-xs tracking-[0.3em] uppercase text-fg-subtle mb-1">Partner Dashboard</p>
            <h1 className="font-[family-name:var(--font-cormorant)] text-2xl md:text-3xl font-light">
              {partner.agent_name}
            </h1>
          </div>
          <button
            onClick={handleSignOut}
            className="text-fg-subtle text-sm hover:text-fg transition-colors"
          >
            Sign out
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
            {error}
            <button onClick={() => setError('')} className="ml-2 text-red-300 hover:text-red-200">x</button>
          </div>
        )}

        {/* Section 1: Overview */}
        <OverviewSection
          partner={partner}
          subscribeLink={subscribeLink}
          totalClients={totalClients}
          daysActive={daysActive}
        />

        {/* Section 2: Your Details */}
        <DetailsSection
          partner={partner}
          onUpdate={(updated) => setPartner(updated)}
          setError={setError}
        />

        {/* Section 3: Featured Listings */}
        <ListingsSection
          partner={partner}
          onUpdate={(updated) => setPartner(updated)}
          setError={setError}
        />

        {/* Section 4: Client Emails */}
        <ClientEmailsSection
          partner={partner}
          subscribeLink={subscribeLink}
          onUpdate={(updated) => setPartner(updated)}
          setError={setError}
        />
      </div>
    </div>
  );
}

// ─── Section 1: Overview ────────────────────────────────────────────────────

function OverviewSection({
  partner,
  subscribeLink,
  totalClients,
  daysActive,
}: {
  partner: PartnerData;
  subscribeLink: string;
  totalClients: number;
  daysActive: number;
}) {
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(subscribeLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusColors: Record<string, string> = {
    active: 'bg-green-500/10 text-green-400 border-green-500/20',
    paused: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    setup: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  return (
    <section className="mb-10 p-6 bg-surface border border-border rounded-lg">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-fg-muted text-sm">
            {partner.brokerage_name && <>{partner.brokerage_name} - </>}
            {partner.neighborhood?.name}, {partner.neighborhood?.city}
          </p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full border ${statusColors[partner.status] || statusColors.setup}`}>
          {partner.status}
        </span>
      </div>

      {/* Subscribe link */}
      <div className="flex items-center gap-2 mb-5">
        <input
          readOnly
          value={subscribeLink}
          className="flex-1 bg-canvas border border-border rounded px-3 py-2 text-sm text-fg font-mono"
        />
        <button
          onClick={copyLink}
          className="text-accent text-sm hover:underline shrink-0 px-3 py-2"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-canvas border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-light text-fg">{totalClients}</p>
          <p className="text-xs tracking-wide uppercase text-fg-subtle mt-1">Subscribers</p>
        </div>
        <div className="bg-canvas border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-light text-fg">{daysActive}</p>
          <p className="text-xs tracking-wide uppercase text-fg-subtle mt-1">Days Active</p>
        </div>
      </div>

      {/* Manage billing */}
      {partner.stripe_customer_id && (
        <ManageBillingButton />
      )}
    </section>
  );
}

// ─── Manage billing button ─────────────────────────────────────────────────

function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const openPortal = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/partner/billing-portal', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Could not open billing portal');
        setLoading(false);
      }
    } catch {
      setError('Network error');
      setLoading(false);
    }
  };

  return (
    <div className="mt-5 pt-5 border-t border-border">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-fg">Billing &amp; subscription</p>
          <p className="text-xs text-fg-subtle mt-0.5">Update payment method, view invoices, or cancel anytime.</p>
        </div>
        <button
          onClick={openPortal}
          disabled={loading}
          className="text-sm px-4 py-2 border border-border rounded-lg text-fg hover:bg-canvas transition-colors disabled:opacity-50"
        >
          {loading ? 'Opening...' : 'Manage Billing'}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  );
}

// ─── Section 2: Details ─────────────────────────────────────────────────────

function DetailsSection({
  partner,
  onUpdate,
  setError,
}: {
  partner: PartnerData;
  onUpdate: (p: PartnerData) => void;
  setError: (e: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(partner.agent_name);
  const [title, setTitle] = useState(partner.agent_title || '');
  const [brokerage, setBrokerage] = useState(partner.brokerage_name || '');
  const [phone, setPhone] = useState(partner.agent_phone || '');
  const [photoUrl, setPhotoUrl] = useState(partner.agent_photo_url || '');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/partner/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: name.trim(),
          agentTitle: title.trim() || undefined,
          brokerageName: brokerage.trim() || undefined,
          agentPhone: phone.trim() || undefined,
          agentPhotoUrl: photoUrl || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onUpdate(data.partner);
        setEditing(false);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save');
      }
    } catch {
      setError('Failed to save changes');
    }
    setSaving(false);
  };

  const handlePhotoUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    setUploadingPhoto(true);
    try {
      const res = await fetch('/api/partner/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) setPhotoUrl(data.url);
    } catch {
      setError('Failed to upload photo');
    }
    setUploadingPhoto(false);
  };

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-[family-name:var(--font-cormorant)] text-xl">Your Details</h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-accent text-sm hover:underline">
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="border border-border rounded-lg p-5 bg-surface space-y-4">
          <div>
            <label className="block text-xs tracking-wide uppercase text-fg-subtle mb-1.5">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-canvas border border-border rounded-lg px-4 py-3 text-fg focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs tracking-wide uppercase text-fg-subtle mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-canvas border border-border rounded-lg px-4 py-3 text-fg focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs tracking-wide uppercase text-fg-subtle mb-1.5">Brokerage</label>
            <input
              type="text"
              value={brokerage}
              onChange={(e) => setBrokerage(e.target.value)}
              className="w-full bg-canvas border border-border rounded-lg px-4 py-3 text-fg focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs tracking-wide uppercase text-fg-subtle mb-1.5">Email</label>
            <input
              type="email"
              value={partner.agent_email}
              readOnly
              className="w-full bg-canvas border border-border rounded-lg px-4 py-3 text-fg-muted cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs tracking-wide uppercase text-fg-subtle mb-1.5">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-canvas border border-border rounded-lg px-4 py-3 text-fg focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs tracking-wide uppercase text-fg-subtle mb-1.5">Profile Photo</label>
            {photoUrl && (
              <img src={photoUrl} alt="Profile" className="w-16 h-16 rounded-full object-cover mb-2" />
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePhotoUpload(file);
              }}
              className="text-sm text-fg-muted"
            />
            {uploadingPhoto && <p className="text-xs text-fg-subtle mt-1">Uploading...</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="bg-fg text-canvas px-6 py-2.5 text-sm font-medium tracking-wide uppercase hover:opacity-90 transition-opacity rounded-lg disabled:opacity-40"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setName(partner.agent_name);
                setTitle(partner.agent_title || '');
                setBrokerage(partner.brokerage_name || '');
                setPhone(partner.agent_phone || '');
                setPhotoUrl(partner.agent_photo_url || '');
              }}
              className="px-6 py-2.5 text-sm border border-border rounded-lg text-fg-muted hover:text-fg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-border rounded-lg p-5 bg-surface space-y-3">
          <div className="flex items-center gap-4">
            {partner.agent_photo_url && (
              <img src={partner.agent_photo_url} alt={partner.agent_name} className="w-14 h-14 rounded-full object-cover" />
            )}
            <div>
              <p className="font-medium text-fg">{partner.agent_name}</p>
              {partner.agent_title && <p className="text-fg-muted text-sm">{partner.agent_title}</p>}
            </div>
          </div>
          {partner.brokerage_name && (
            <p className="text-fg-muted text-sm">{partner.brokerage_name}</p>
          )}
          <p className="text-fg-muted text-sm">{partner.agent_email}</p>
          {partner.agent_phone && (
            <p className="text-fg-muted text-sm">{partner.agent_phone}</p>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Section 3: Listings ────────────────────────────────────────────────────

function ListingsSection({
  partner,
  onUpdate,
  setError,
}: {
  partner: PartnerData;
  onUpdate: (p: PartnerData) => void;
  setError: (e: string) => void;
}) {
  const [listings, setListings] = useState<Listing[]>(partner.listings || []);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Listing>({ address: '', price: '' });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/partner/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listings }),
      });
      if (res.ok) {
        const data = await res.json();
        onUpdate(data.partner);
        setHasChanges(false);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save listings');
      }
    } catch {
      setError('Failed to save listings');
    }
    setSaving(false);
  };

  const addListing = () => {
    if (!editing.address || !editing.price) return;
    setListings([...listings, { ...editing }]);
    setEditing({ address: '', price: '' });
    setShowForm(false);
    setHasChanges(true);
  };

  const removeListing = (index: number) => {
    setListings(listings.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handlePhotoUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    setUploadingPhoto(true);
    try {
      const res = await fetch('/api/partner/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) setEditing({ ...editing, photo_url: data.url });
    } catch {
      setError('Failed to upload photo');
    }
    setUploadingPhoto(false);
  };

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-[family-name:var(--font-cormorant)] text-xl">Featured Listings</h2>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-fg text-canvas px-4 py-2 text-sm font-medium tracking-wide uppercase hover:opacity-90 transition-opacity rounded-lg disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save listings'}
          </button>
        )}
      </div>

      <p className="text-fg-subtle text-sm mb-4">Changes appear in tomorrow morning's email.</p>

      {listings.map((listing, i) => (
        <div key={i} className="border border-border rounded-lg p-4 mb-3 bg-surface">
          {listing.photo_url && (
            <img src={listing.photo_url} alt={listing.address} className="w-full h-32 object-cover rounded-lg mb-3" />
          )}
          <p className="font-medium text-fg">{listing.address}</p>
          <p className="text-accent font-semibold">{listing.price}</p>
          {(listing.beds || listing.baths || listing.sqft) && (
            <p className="text-fg-muted text-sm">
              {[listing.beds && `${listing.beds} BD`, listing.baths && `${listing.baths} BA`, listing.sqft && `${listing.sqft} SF`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {listing.description && <p className="text-fg-subtle text-sm mt-1">{listing.description}</p>}
          {listing.link_url && (
            <a href={listing.link_url} target="_blank" rel="noopener noreferrer" className="text-accent text-xs mt-1 hover:underline inline-block">
              View listing
            </a>
          )}
          <div className="mt-2">
            <button
              onClick={() => removeListing(i)}
              className="text-red-400 text-xs hover:text-red-300"
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      {showForm ? (
        <div className="border border-border rounded-lg p-4 bg-surface space-y-3">
          <input
            type="text"
            placeholder="Address *"
            value={editing.address}
            onChange={(e) => setEditing({ ...editing, address: e.target.value })}
            className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
          />
          <input
            type="text"
            placeholder="Price *"
            value={editing.price}
            onChange={(e) => setEditing({ ...editing, price: e.target.value })}
            className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
          />
          <div className="grid grid-cols-3 gap-2">
            <input type="text" placeholder="Beds" value={editing.beds || ''} onChange={(e) => setEditing({ ...editing, beds: e.target.value })} className="bg-canvas border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent" />
            <input type="text" placeholder="Baths" value={editing.baths || ''} onChange={(e) => setEditing({ ...editing, baths: e.target.value })} className="bg-canvas border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent" />
            <input type="text" placeholder="Sqft" value={editing.sqft || ''} onChange={(e) => setEditing({ ...editing, sqft: e.target.value })} className="bg-canvas border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent" />
          </div>
          <textarea
            placeholder="Description (max 200 chars)"
            maxLength={200}
            value={editing.description || ''}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent h-20 resize-none"
          />
          <input
            type="url"
            placeholder="Listing URL (optional)"
            value={editing.link_url || ''}
            onChange={(e) => setEditing({ ...editing, link_url: e.target.value })}
            className="w-full bg-canvas border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
          />
          <div>
            <label className="text-xs text-fg-subtle">Listing photo</label>
            {editing.photo_url && (
              <img src={editing.photo_url} alt="" className="w-full h-24 object-cover rounded-lg mb-2 mt-1" />
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePhotoUpload(file);
              }}
              className="text-sm text-fg-muted"
            />
            {uploadingPhoto && <p className="text-xs text-fg-subtle mt-1">Uploading...</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={addListing} disabled={!editing.address || !editing.price} className="bg-fg text-canvas px-4 py-2 text-sm rounded-lg disabled:opacity-40">
              Add
            </button>
            <button onClick={() => { setShowForm(false); setEditing({ address: '', price: '' }); }} className="text-fg-muted text-sm px-4 py-2">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        listings.length < 3 && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full border border-dashed border-border rounded-lg py-3 text-fg-muted text-sm hover:border-accent hover:text-accent transition-colors"
          >
            + Add a listing
          </button>
        )
      )}
    </section>
  );
}

// ─── Section 4: Client Emails ───────────────────────────────────────────────

function ClientEmailsSection({
  partner,
  subscribeLink,
  onUpdate,
  setError,
}: {
  partner: PartnerData;
  subscribeLink: string;
  onUpdate: (p: PartnerData) => void;
  setError: (e: string) => void;
}) {
  const MAX_CLIENT_EMAILS = 500;
  const [emails, setEmails] = useState<string[]>(partner.client_emails || []);
  const [emailInput, setEmailInput] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [copied, setCopied] = useState(false);

  const addEmail = () => {
    if (emails.length >= MAX_CLIENT_EMAILS) return;
    const trimmed = emailInput.trim().toLowerCase();
    if (trimmed && trimmed.includes('@') && !emails.includes(trimmed)) {
      setEmails([...emails, trimmed]);
      setHasChanges(true);
    }
    setEmailInput('');
  };

  const addBulkEmails = () => {
    const newEmails = bulkInput
      .split(/[\n,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@') && !emails.includes(e));
    const remaining = MAX_CLIENT_EMAILS - emails.length;
    setEmails([...emails, ...newEmails.slice(0, remaining)]);
    setBulkInput('');
    setBulkMode(false);
    setHasChanges(true);
  };

  const removeEmail = (email: string) => {
    setEmails(emails.filter((e) => e !== email));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/partner/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientEmails: emails }),
      });
      if (res.ok) {
        const data = await res.json();
        onUpdate(data.partner);
        setHasChanges(false);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save');
      }
    } catch {
      setError('Failed to save emails');
    }
    setSaving(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(subscribeLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredEmails = searchFilter
    ? emails.filter((e) => e.includes(searchFilter.toLowerCase()))
    : emails;

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-[family-name:var(--font-cormorant)] text-xl">Client Emails</h2>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-fg text-canvas px-4 py-2 text-sm font-medium tracking-wide uppercase hover:opacity-90 transition-opacity rounded-lg disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        )}
      </div>

      <p className="text-fg-muted text-sm mb-4">
        {emails.length} of {MAX_CLIENT_EMAILS} client emails
      </p>

      {emails.length >= MAX_CLIENT_EMAILS && (
        <p className="text-amber-400 text-sm mb-4">Maximum of {MAX_CLIENT_EMAILS} client emails reached. Contact us if you need more.</p>
      )}

      {/* Add email */}
      {!bulkMode ? (
        <div className="flex gap-2 mb-3">
          <input
            type="email"
            placeholder="client@email.com"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addEmail()}
            className="flex-1 bg-surface border border-border rounded-lg px-4 py-3 text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
          />
          <button onClick={addEmail} disabled={emails.length >= MAX_CLIENT_EMAILS} className="bg-fg text-canvas px-4 py-3 text-sm rounded-lg font-medium disabled:opacity-40">
            Add
          </button>
        </div>
      ) : (
        <div className="mb-3">
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

      {/* Email list with search */}
      {emails.length > 0 && (
        <div className="border border-border rounded-lg bg-surface mb-4">
          {emails.length > 10 && (
            <div className="px-4 pt-3">
              <input
                type="text"
                placeholder="Search emails..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-canvas border border-border rounded px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
              />
            </div>
          )}
          <div className="p-4">
            <p className="text-sm font-medium mb-2 text-fg">
              {searchFilter ? `${filteredEmails.length} of ${emails.length} emails` : `${emails.length} client${emails.length !== 1 ? 's' : ''}`}
            </p>
            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {filteredEmails.map((email) => (
                <div key={email} className="flex justify-between items-center text-sm">
                  <span className="text-fg-muted">{email}</span>
                  <button
                    onClick={() => removeEmail(email)}
                    className="text-red-400 text-xs hover:text-red-300 shrink-0 ml-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {searchFilter && filteredEmails.length === 0 && (
                <p className="text-fg-subtle text-sm text-center py-2">No emails match "{searchFilter}"</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Subscribe link */}
      <div className="p-4 bg-surface border border-border rounded-lg">
        <p className="text-xs text-fg-subtle mb-2">Your subscribe link</p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={subscribeLink}
            className="flex-1 bg-canvas border border-border rounded px-3 py-1.5 text-sm text-fg font-mono"
          />
          <button
            onClick={copyLink}
            className="text-accent text-xs hover:underline shrink-0"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-fg-subtle mt-2">Clients who subscribe through this link are added automatically.</p>
      </div>
    </section>
  );
}
