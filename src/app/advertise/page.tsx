import Link from 'next/link';
import { AD_FREQUENCY } from '@/lib/ad-engine';

export const metadata = {
  title: 'Advertise | Flâneur',
  description: 'Reach engaged local audiences with Flâneur advertising.',
};

const displayPackages = [
  {
    name: 'Weekly Local',
    price: '$150',
    duration: '7 days',
    description: 'Perfect for testing campaigns',
    features: [
      'One neighborhood',
      'Premium native placement',
      'Real-time analytics',
      'Affluent local audience',
    ],
    highlighted: false,
  },
  {
    name: 'Monthly Local',
    price: '$500',
    duration: '30 days',
    description: 'Best value for local businesses',
    features: [
      'One neighborhood',
      'Premium native placement',
      'Real-time analytics',
      'Priority positioning',
      'Save 17% vs weekly',
    ],
    highlighted: true,
  },
  {
    name: 'City-Wide',
    price: '$1,500',
    duration: '30 days',
    description: 'Reach an entire city',
    features: [
      'All neighborhoods in one city',
      'Premium native placement',
      'Real-time analytics',
      'Priority positioning',
      'Dedicated support',
    ],
    highlighted: false,
  },
  {
    name: 'Global',
    price: '$3,000',
    duration: '30 days',
    description: 'Maximum reach across all markets',
    features: [
      'All neighborhoods worldwide',
      'Premium native placement',
      'Real-time analytics',
      'Priority positioning',
      'Dedicated account manager',
    ],
    highlighted: false,
  },
];

const newsletterPackages = [
  {
    name: 'Single Issue',
    price: '$200',
    description: 'Sponsor one newsletter',
    features: [
      'Banner ad in newsletter',
      'Reaches engaged subscribers',
      'High open rates',
    ],
  },
  {
    name: 'Weekly',
    price: '$700',
    description: '4 newsletter issues',
    features: [
      'Banner ad in 4 newsletters',
      'Sustained visibility',
      'Save 12% vs single',
    ],
  },
  {
    name: 'Dedicated Email',
    price: '$800',
    description: 'Exclusive email blast',
    features: [
      'Your message only',
      'Full subscriber list',
      'Maximum impact',
    ],
  },
];

export default function AdvertisePage() {
  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-3xl font-light tracking-wide mb-4">
            Advertise With Flâneur
          </h1>
          <p className="text-neutral-600 max-w-2xl mx-auto mb-4">
            Connect with engaged readers in the neighborhoods that matter most to your
            business. Our native ad format blends seamlessly with editorial content.
          </p>
          <p className="text-sm text-neutral-400">
            Premium placement: 1 ad per {AD_FREQUENCY} articles for optimal engagement
          </p>
        </div>

        {/* Display Ad Pricing */}
        <h2 className="text-xs tracking-[0.2em] uppercase text-neutral-400 mb-6 text-center">
          Display Advertising
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {displayPackages.map((pkg) => (
            <div
              key={pkg.name}
              className={`p-6 border ${
                pkg.highlighted
                  ? 'border-black bg-white shadow-lg'
                  : 'border-neutral-200 bg-white'
              }`}
            >
              {pkg.highlighted && (
                <span className="text-[10px] tracking-[0.2em] uppercase text-neutral-400 mb-2 block">
                  Most Popular
                </span>
              )}
              <h3 className="text-lg font-medium mb-1">{pkg.name}</h3>
              <p className="text-3xl font-light mb-1">{pkg.price}</p>
              <p className="text-sm text-neutral-400 mb-4">{pkg.duration}</p>
              <p className="text-sm text-neutral-600 mb-6">{pkg.description}</p>
              <ul className="space-y-2 mb-6">
                {pkg.features.map((feature) => (
                  <li key={feature} className="text-sm flex items-start gap-2">
                    <span className="text-black">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/login?redirect=/advertiser/ads/new"
                className={`block text-center py-3 text-sm tracking-widest uppercase transition-colors ${
                  pkg.highlighted
                    ? 'bg-black text-white hover:bg-neutral-800'
                    : 'border border-black hover:bg-black hover:text-white'
                }`}
              >
                Get Started
              </Link>
            </div>
          ))}
        </div>

        {/* Newsletter Sponsorship */}
        <h2 className="text-xs tracking-[0.2em] uppercase text-neutral-400 mb-6 text-center">
          Newsletter Sponsorship
        </h2>
        <p className="text-neutral-600 text-center max-w-2xl mx-auto mb-8">
          Reach our most engaged readers directly in their inbox. Newsletter subscribers
          have the highest engagement rates and purchasing intent.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 max-w-3xl mx-auto">
          {newsletterPackages.map((pkg) => (
            <div key={pkg.name} className="p-6 border border-neutral-200 bg-white">
              <h3 className="text-lg font-medium mb-1">{pkg.name}</h3>
              <p className="text-3xl font-light mb-4">{pkg.price}</p>
              <p className="text-sm text-neutral-600 mb-6">{pkg.description}</p>
              <ul className="space-y-2 mb-6">
                {pkg.features.map((feature) => (
                  <li key={feature} className="text-sm flex items-start gap-2">
                    <span className="text-black">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/login?redirect=/advertiser"
                className="block text-center py-3 text-sm tracking-widest uppercase border border-black hover:bg-black hover:text-white transition-colors"
              >
                Get Started
              </Link>
            </div>
          ))}
        </div>

        {/* How It Works */}
        <div className="mb-16">
          <h2 className="text-xs tracking-[0.2em] uppercase text-neutral-400 mb-8 text-center">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-black text-white flex items-center justify-center text-lg font-light mx-auto mb-4">
                1
              </div>
              <h3 className="font-medium mb-2">Create Your Ad</h3>
              <p className="text-sm text-neutral-600">
                Upload your image, write your headline, and choose your target
                neighborhoods.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-black text-white flex items-center justify-center text-lg font-light mx-auto mb-4">
                2
              </div>
              <h3 className="font-medium mb-2">Quick Review</h3>
              <p className="text-sm text-neutral-600">
                We review all ads within 24 hours, usually much more quickly. You&apos;ll receive an email when approved.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-black text-white flex items-center justify-center text-lg font-light mx-auto mb-4">
                3
              </div>
              <h3 className="font-medium mb-2">Select &amp; Pay</h3>
              <p className="text-sm text-neutral-600">
                Choose your package duration and complete secure payment via Stripe.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-black text-white flex items-center justify-center text-lg font-light mx-auto mb-4">
                4
              </div>
              <h3 className="font-medium mb-2">Go Live</h3>
              <p className="text-sm text-neutral-600">
                Your ad goes live immediately after payment. Track performance in real-time.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center bg-neutral-100 py-12 px-4">
          <h2 className="text-xl font-light mb-4">Ready to reach your local audience?</h2>
          <Link
            href="/login?redirect=/advertiser"
            className="inline-block bg-black text-white px-8 py-3 text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors"
          >
            Create Your First Ad
          </Link>
        </div>
      </div>
    </div>
  );
}
