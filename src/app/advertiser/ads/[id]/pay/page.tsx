'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Ad, AdPackage } from '@/types';

export default function PayForAdPage() {
  const router = useRouter();
  const params = useParams();
  const adId = params.id as string;

  const [ad, setAd] = useState<Ad | null>(null);
  const [packages, setPackages] = useState<AdPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const supabase = createClient();

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (!mounted) return;

        if (sessionError || !session?.user) {
          router.push('/login?redirect=/advertiser');
          return;
        }

        // Fetch ad
        const { data: adData, error: adError } = await supabase
          .from('ads')
          .select('*')
          .eq('id', adId)
          .eq('advertiser_id', session.user.id)
          .single();

        if (!mounted) return;

        if (adError || !adData) {
          setError('Ad not found');
          setLoading(false);
          return;
        }

        if (adData.status !== 'approved') {
          setError('This ad is not ready for payment');
          setLoading(false);
          return;
        }

        setAd(adData as Ad);

        // Check if user is admin (for free ads)
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        if (profile?.role === 'admin') {
          setIsAdmin(true);
        }

        // Fetch packages
        const { data: packagesData } = await supabase
          .from('ad_packages')
          .select('*')
          .eq('active', true)
          .eq('is_global', adData.is_global)
          .order('price_cents', { ascending: true });

        if (mounted) {
          setPackages(packagesData || []);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading payment page:', err);
        if (mounted) {
          router.push('/login?redirect=/advertiser');
        }
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [adId, router]);

  const handlePayment = async (packageId: string) => {
    if (!ad) return;

    setError(null);
    setProcessing(true);

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adId: ad.id,
          packageId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
      setProcessing(false);
    }
  };

  const handleFreeActivation = async (packageId: string) => {
    if (!ad) return;

    setError(null);
    setProcessing(true);

    try {
      const response = await fetch(`/api/advertiser/ads/${ad.id}/activate-free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to activate ad');
      }

      router.push('/advertiser?activated=true');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed');
      setProcessing(false);
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  if (loading) {
    return (
      <div className="py-12 px-4">
        <div className="mx-auto max-w-2xl">
          <p className="text-neutral-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (error && !ad) {
    return (
      <div className="py-12 px-4">
        <div className="mx-auto max-w-2xl">
          <div className="p-4 bg-red-50 border border-red-200 text-red-600 mb-6">
            {error}
          </div>
          <Link
            href="/advertiser"
            className="text-sm text-neutral-500 hover:text-black"
          >
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-3xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Package Selection */}
          <div>
            <h1 className="text-2xl font-light mb-2">Complete Payment</h1>
            <p className="text-neutral-500 mb-8">
              Choose how long you want your ad to run.
            </p>

            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 mb-6">
                {error}
              </div>
            )}

            {isAdmin && (
              <div className="bg-green-50 border border-green-200 p-4 mb-6">
                <p className="text-sm text-green-800 font-medium mb-1">Owner Account</p>
                <p className="text-sm text-green-700">You can activate ads for free.</p>
              </div>
            )}

            <div className="space-y-4 mb-8">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="p-6 border border-neutral-200"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-medium text-lg">{pkg.name}</h3>
                      <p className="text-sm text-neutral-500">{pkg.duration_days} days</p>
                      {pkg.description && (
                        <p className="text-sm text-neutral-400 mt-1">{pkg.description}</p>
                      )}
                    </div>
                    <p className="text-2xl font-light">{formatPrice(pkg.price_cents)}</p>
                  </div>
                  <div className="flex gap-3">
                    {isAdmin && (
                      <button
                        onClick={() => handleFreeActivation(pkg.id)}
                        disabled={processing}
                        className="flex-1 bg-green-600 text-white py-2 text-sm tracking-widest uppercase hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {processing ? 'Processing...' : 'Activate Free'}
                      </button>
                    )}
                    <button
                      onClick={() => handlePayment(pkg.id)}
                      disabled={processing}
                      className={`${isAdmin ? 'flex-1' : 'w-full'} bg-black text-white py-2 text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors disabled:opacity-50`}
                    >
                      {processing ? 'Processing...' : isAdmin ? 'Pay Anyway' : 'Select'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <Link
              href="/advertiser"
              className="text-sm text-neutral-500 hover:text-black"
            >
              &larr; Back to Dashboard
            </Link>
          </div>

          {/* Ad Preview */}
          <div>
            <p className="text-xs tracking-widest uppercase text-neutral-400 mb-4">
              Your Ad
            </p>
            <div className="bg-neutral-100 p-4 rounded">
              <div className="bg-white overflow-hidden max-w-sm mx-auto">
                <div className="px-3 py-2">
                  <span className="text-[10px] tracking-[0.2em] uppercase text-neutral-400">
                    SPONSORED
                  </span>
                </div>
                <img
                  src={ad?.image_url}
                  alt={ad?.headline}
                  className="w-full aspect-video object-cover"
                />
                <div className="p-3">
                  <h3 className="font-semibold text-sm">{ad?.headline}</h3>
                </div>
              </div>
              <p className="text-xs text-neutral-400 mt-4 text-center">
                {ad?.is_global ? 'Shown in all neighborhoods' : 'Shown in selected neighborhood'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
