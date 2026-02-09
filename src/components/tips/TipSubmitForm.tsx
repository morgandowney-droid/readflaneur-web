'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import PhotoUploader from './PhotoUploader';
import type { CreditPreference } from '@/types';

interface Neighborhood {
  id: string;
  name: string;
  city: string;
}

interface UploadedPhoto {
  url: string;
  path: string;
  filename: string;
  size: number;
  type: string;
  preview?: string;
}

interface TipSubmitFormProps {
  initialNeighborhoodId?: string;
  onSuccess?: (tipId: string) => void;
  onCancel?: () => void;
}

type Step = 'content' | 'photos' | 'contact' | 'terms';

export default function TipSubmitForm({
  initialNeighborhoodId,
  onSuccess,
  onCancel,
}: TipSubmitFormProps) {
  const [step, setStep] = useState<Step>('content');
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [neighborhoodId, setNeighborhoodId] = useState(initialNeighborhoodId || '');
  const [headline, setHeadline] = useState('');
  const [content, setContent] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [submitterName, setSubmitterName] = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');
  const [submitterPhone, setSubmitterPhone] = useState('');
  const [creditPreference, setCreditPreference] = useState<CreditPreference>('anonymous');
  const [allowCredit, setAllowCredit] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // GPS state
  const [gpsLatitude, setGpsLatitude] = useState<number | null>(null);
  const [gpsLongitude, setGpsLongitude] = useState<number | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsRequested, setGpsRequested] = useState(false);

  // Load neighborhoods
  useEffect(() => {
    const fetchNeighborhoods = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('neighborhoods')
          .select('id, name, city')
          .order('city')
          .order('name');

        if (error) {
          console.error('Failed to load neighborhoods:', error);
          setLoadError(`Failed to load neighborhoods: ${error.message}`);
        } else if (!data || data.length === 0) {
          setLoadError('No neighborhoods found. Please try again later.');
        } else {
          setNeighborhoods(data);
        }
      } catch (err) {
        console.error('Error fetching neighborhoods:', err);
        setLoadError(err instanceof Error ? err.message : 'Failed to connect to server');
      } finally {
        setLoading(false);
      }
    };

    fetchNeighborhoods();
  }, []);

  // Request GPS location
  const requestLocation = () => {
    if (!navigator.geolocation) {
      return;
    }

    setGpsRequested(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsLatitude(position.coords.latitude);
        setGpsLongitude(position.coords.longitude);
        setGpsAccuracy(position.coords.accuracy);
      },
      (error) => {
        console.log('GPS error:', error.message);
        // Silently fail - GPS is optional
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes
      }
    );
  };

  // Group neighborhoods by city
  const neighborhoodsByCity = neighborhoods.reduce((acc, n) => {
    if (!acc[n.city]) acc[n.city] = [];
    acc[n.city].push(n);
    return acc;
  }, {} as Record<string, Neighborhood[]>);

  const canProceedFromContent = neighborhoodId && content.trim().length > 0;
  const canProceedFromPhotos = true; // Photos are optional
  const canProceedFromContact = true; // Contact is optional
  const canSubmit = termsAccepted;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/tips/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
          'X-Screen-Resolution': `${window.screen.width}x${window.screen.height}`,
        },
        body: JSON.stringify({
          content: content.trim(),
          headline: headline.trim() || undefined,
          neighborhood_id: neighborhoodId,
          submitter_name: submitterName.trim() || undefined,
          submitter_email: submitterEmail.trim() || undefined,
          submitter_phone: submitterPhone.trim() || undefined,
          credit_preference: creditPreference,
          allow_credit: allowCredit,
          photo_urls: photos.map(p => p.url),
          gps_latitude: gpsLatitude,
          gps_longitude: gpsLongitude,
          gps_accuracy: gpsAccuracy,
          terms_accepted: true,
          terms_version: '1.0',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit tip');
      }

      if (data.rejected) {
        throw new Error(data.reason || 'Your tip was flagged for review. Please try again.');
      }

      onSuccess?.(data.tipId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit tip');
    } finally {
      setSubmitting(false);
    }
  };

  const goToStep = (newStep: Step) => {
    setError(null);
    setStep(newStep);

    // Request GPS when entering content step (first time)
    if (newStep === 'content' && !gpsRequested) {
      requestLocation();
    }
  };

  // Request GPS on mount
  useEffect(() => {
    if (!gpsRequested) {
      requestLocation();
    }
  }, [gpsRequested]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-neutral-100 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-8 text-center space-y-4">
        <p className="text-red-600 text-sm">{loadError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-sm text-neutral-400 border border-white/[0.08] hover:border-white/20 transition-colors"
        >
          Retry
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="ml-2 px-4 py-2 text-sm text-neutral-500 hover:text-white"
          >
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center justify-between text-xs">
        {(['content', 'photos', 'contact', 'terms'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center">
            <button
              type="button"
              onClick={() => {
                // Can only go back, not forward
                const currentIndex = ['content', 'photos', 'contact', 'terms'].indexOf(step);
                if (i < currentIndex) {
                  goToStep(s);
                }
              }}
              className={`
                w-8 h-8 rounded-full flex items-center justify-center
                transition-colors
                ${step === s
                  ? 'bg-amber-600 text-white'
                  : i < ['content', 'photos', 'contact', 'terms'].indexOf(step)
                    ? 'bg-neutral-700 text-neutral-200 cursor-pointer hover:bg-neutral-600'
                    : 'bg-neutral-800 text-neutral-500'
                }
              `}
            >
              {i + 1}
            </button>
            {i < 3 && (
              <div className={`w-12 sm:w-20 h-0.5 mx-1 ${
                i < ['content', 'photos', 'contact', 'terms'].indexOf(step)
                  ? 'bg-amber-600'
                  : 'bg-neutral-700'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 bg-red-900/20 border border-red-800/30 text-red-400 text-sm rounded">
          {error}
        </div>
      )}

      {/* Step 1: Content */}
      {step === 'content' && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-neutral-100">Oh, do spill some tea..</h3>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              Neighborhood *
            </label>
            <select
              value={neighborhoodId}
              onChange={(e) => setNeighborhoodId(e.target.value)}
              className="w-full px-3 py-2 bg-canvas border border-white/[0.08] text-neutral-100 rounded placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">Select a neighborhood...</option>
              {Object.entries(neighborhoodsByCity).map(([city, hoods]) => (
                <optgroup key={city} label={city}>
                  {hoods.map(hood => (
                    <option key={hood.id} value={hood.id}>
                      {hood.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              A TLDR on what this is all about (optional)
            </label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Brief summary of your tip"
              maxLength={200}
              className="w-full px-3 py-2 bg-canvas border border-white/[0.08] text-neutral-100 rounded placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              Your tip *
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Share what you know... The more detail, the better."
              rows={6}
              className="w-full px-3 py-2 bg-canvas border border-white/[0.08] text-neutral-100 rounded placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
            />
            <p className="text-xs text-neutral-500 mt-1">
              {content.length} characters
            </p>
          </div>

          <div className="flex justify-between pt-4">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => goToStep('photos')}
              disabled={!canProceedFromContent}
              className="ml-auto px-6 py-2 bg-black text-white text-sm uppercase tracking-wider hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Photos */}
      {step === 'photos' && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-neutral-100">Add photos (optional)</h3>
          <p className="text-sm text-neutral-400">
            Photos help our journalists verify and illustrate your tip.
          </p>

          <PhotoUploader
            photos={photos}
            onPhotosChange={setPhotos}
            maxPhotos={5}
            maxSizeMB={10}
          />

          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => goToStep('content')}
              className="px-4 py-2 text-sm text-neutral-400 hover:text-white"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => goToStep('contact')}
              disabled={!canProceedFromPhotos}
              className="px-6 py-2 bg-black text-white text-sm uppercase tracking-wider hover:bg-neutral-800 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Contact */}
      {step === 'contact' && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-neutral-100">Contact information (optional)</h3>
          <p className="text-sm text-neutral-400">
            Providing contact info helps our journalists follow up if needed.
            Your information will not be published without your consent.
          </p>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              Name
            </label>
            <input
              type="text"
              value={submitterName}
              onChange={(e) => setSubmitterName(e.target.value)}
              placeholder="Your name"
              className="w-full px-3 py-2 bg-canvas border border-white/[0.08] text-neutral-100 rounded placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              Email
            </label>
            <input
              type="email"
              value={submitterEmail}
              onChange={(e) => setSubmitterEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-3 py-2 bg-canvas border border-white/[0.08] text-neutral-100 rounded placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              Phone
            </label>
            <input
              type="tel"
              value={submitterPhone}
              onChange={(e) => setSubmitterPhone(e.target.value)}
              placeholder="(555) 555-5555"
              className="w-full px-3 py-2 bg-canvas border border-white/[0.08] text-neutral-100 rounded placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="pt-2">
            <label className="block text-sm text-neutral-400 mb-2">
              How should we credit you if we publish your tip?
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="credit"
                  checked={creditPreference === 'anonymous'}
                  onChange={() => setCreditPreference('anonymous')}
                  className="mr-2"
                />
                <span className="text-sm">Anonymous (no credit)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="credit"
                  checked={creditPreference === 'name_only'}
                  onChange={() => setCreditPreference('name_only')}
                  className="mr-2"
                />
                <span className="text-sm">Name only</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="credit"
                  checked={creditPreference === 'name_and_contact'}
                  onChange={() => setCreditPreference('name_and_contact')}
                  className="mr-2"
                />
                <span className="text-sm">Name and contact information</span>
              </label>
            </div>
          </div>

          {creditPreference !== 'anonymous' && (
            <label className="flex items-start pt-2">
              <input
                type="checkbox"
                checked={allowCredit}
                onChange={(e) => setAllowCredit(e.target.checked)}
                className="mr-2 mt-0.5"
              />
              <span className="text-sm text-neutral-400">
                I consent to being credited in published content
              </span>
            </label>
          )}

          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => goToStep('photos')}
              className="px-4 py-2 text-sm text-neutral-400 hover:text-white"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => goToStep('terms')}
              disabled={!canProceedFromContact}
              className="px-6 py-2 bg-black text-white text-sm uppercase tracking-wider hover:bg-neutral-800 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Terms */}
      {step === 'terms' && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Review and submit</h3>

          <div className="bg-canvas p-4 rounded text-sm text-neutral-300 space-y-2">
            <p><strong>Neighborhood:</strong> {neighborhoods.find(n => n.id === neighborhoodId)?.name}</p>
            {headline && <p><strong>Headline:</strong> {headline}</p>}
            <p><strong>Photos:</strong> {photos.length} attached</p>
            <p><strong>Contact:</strong> {submitterEmail || submitterName || 'Anonymous'}</p>
          </div>

          <div className="border border-white/[0.08] rounded p-4">
            <label className="flex items-start">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mr-3 mt-0.5"
              />
              <span className="text-sm text-neutral-300">
                I agree to the{' '}
                <a href="/terms" target="_blank" className="underline hover:text-white">
                  Tip Submission Terms
                </a>{' '}
                and grant Flâneur the right to use, edit, and publish my submitted content.
                I confirm that I have the right to submit this content and any photos included.
              </span>
            </label>
          </div>

          <p className="text-xs text-neutral-500">
            By submitting, you agree to our{' '}
            <a href="/privacy" target="_blank" className="underline">Privacy Policy</a>.
            We collect device and location data to verify submissions and prevent abuse.
          </p>

          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={() => goToStep('contact')}
              disabled={submitting}
              className="px-4 py-2 text-sm text-neutral-400 hover:text-white disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="px-6 py-2 bg-black text-white text-sm uppercase tracking-wider hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                'Submit Tip'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
