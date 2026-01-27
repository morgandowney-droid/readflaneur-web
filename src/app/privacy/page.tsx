import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Flâneur',
  description: 'Privacy policy for Flâneur, including how we collect and use your data.',
};

export default function PrivacyPage() {
  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-2xl prose prose-neutral">
        <h1 className="text-2xl font-light tracking-wide mb-8">Privacy Policy</h1>

        <p className="text-sm text-neutral-500 mb-8">
          Last updated: January 2026
        </p>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">1. Introduction</h2>
          <p className="text-sm text-neutral-700 mb-4">
            Flâneur (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy
            explains how we collect, use, disclose, and safeguard your information when you use our website
            and services.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">2. Information We Collect</h2>

          <h3 className="text-base font-medium mt-6 mb-3">2.1 Information You Provide</h3>
          <ul className="text-sm text-neutral-700 list-disc pl-6 mb-4 space-y-1">
            <li><strong>Account Information:</strong> Email address, name, and password when you create an account</li>
            <li><strong>Tip Submissions:</strong> Content, photos, and optional contact information (name, email, phone) when you submit tips</li>
            <li><strong>Newsletter Subscriptions:</strong> Email address and neighborhood preferences</li>
            <li><strong>Advertising Information:</strong> Business information when you create advertisements</li>
          </ul>

          <h3 className="text-base font-medium mt-6 mb-3">2.2 Information Collected Automatically</h3>
          <p className="text-sm text-neutral-700 mb-2">
            When you use our services, we automatically collect:
          </p>
          <ul className="text-sm text-neutral-700 list-disc pl-6 mb-4 space-y-1">
            <li><strong>Device Information:</strong> Device type, operating system, browser type, screen resolution</li>
            <li><strong>Usage Data:</strong> Pages visited, time spent, click patterns</li>
            <li><strong>Location Data:</strong> IP address (stored in hashed form) and, with your permission, GPS coordinates</li>
            <li><strong>Cookies:</strong> Session cookies for authentication and preferences</li>
          </ul>

          <h3 className="text-base font-medium mt-6 mb-3">2.3 Tip Submission Data</h3>
          <p className="text-sm text-neutral-700 mb-2">
            When you submit a tip, we collect additional data to help verify submissions and prevent abuse:
          </p>
          <ul className="text-sm text-neutral-700 list-disc pl-6 mb-4 space-y-1">
            <li>IP address (stored as a cryptographic hash for privacy)</li>
            <li>Browser and device information from your user agent</li>
            <li>Timezone and language settings</li>
            <li>Screen resolution</li>
            <li>GPS coordinates (only if you grant location permission)</li>
            <li>Timestamp of submission</li>
          </ul>
          <p className="text-sm text-neutral-700 mb-4">
            This data helps our editorial team verify the authenticity of submissions and detect potential
            fraud or abuse. IP addresses are always hashed before storage to protect your privacy.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">3. How We Use Your Information</h2>
          <p className="text-sm text-neutral-700 mb-2">
            We use the collected information for:
          </p>
          <ul className="text-sm text-neutral-700 list-disc pl-6 mb-4 space-y-1">
            <li>Providing and improving our services</li>
            <li>Processing and reviewing tip submissions</li>
            <li>Contacting you about submissions (if you provide contact information)</li>
            <li>Sending newsletters and updates (with your consent)</li>
            <li>Preventing fraud and abuse</li>
            <li>Analyzing usage patterns to improve user experience</li>
            <li>Complying with legal obligations</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">4. Information Sharing</h2>
          <p className="text-sm text-neutral-700 mb-2">
            We do not sell your personal information. We may share information with:
          </p>
          <ul className="text-sm text-neutral-700 list-disc pl-6 mb-4 space-y-1">
            <li><strong>Service Providers:</strong> Third parties who help us operate our services (hosting, email, analytics)</li>
            <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
            <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
          </ul>
          <p className="text-sm text-neutral-700 mb-4">
            <strong>Note:</strong> If you submit a tip and consent to being credited, your name may be
            published alongside the content in accordance with your stated credit preferences.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">5. Data Retention</h2>
          <ul className="text-sm text-neutral-700 list-disc pl-6 mb-4 space-y-1">
            <li><strong>Account Data:</strong> Retained until you delete your account</li>
            <li><strong>Tip Submissions:</strong> Retained indefinitely for editorial and archival purposes</li>
            <li><strong>Device/Location Data:</strong> Retained for 2 years for fraud prevention</li>
            <li><strong>Newsletter Subscriptions:</strong> Retained until you unsubscribe</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">6. Your Rights</h2>
          <p className="text-sm text-neutral-700 mb-2">
            Depending on your location, you may have the right to:
          </p>
          <ul className="text-sm text-neutral-700 list-disc pl-6 mb-4 space-y-1">
            <li>Access the personal information we hold about you</li>
            <li>Request correction of inaccurate information</li>
            <li>Request deletion of your personal information</li>
            <li>Opt out of marketing communications</li>
            <li>Withdraw consent for data processing</li>
          </ul>
          <p className="text-sm text-neutral-700 mb-4">
            To exercise these rights, please contact us at privacy@readflaneur.com.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">7. Security</h2>
          <p className="text-sm text-neutral-700 mb-4">
            We implement appropriate technical and organizational measures to protect your personal
            information, including encryption, access controls, and secure data storage. However, no
            method of transmission over the Internet is 100% secure.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">8. Cookies</h2>
          <p className="text-sm text-neutral-700 mb-4">
            We use cookies and similar technologies to maintain your session, remember your preferences,
            and analyze how our services are used. You can control cookie settings through your browser.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">9. Third-Party Services</h2>
          <p className="text-sm text-neutral-700 mb-2">
            Our services may use the following third-party providers:
          </p>
          <ul className="text-sm text-neutral-700 list-disc pl-6 mb-4 space-y-1">
            <li><strong>Supabase:</strong> Database and authentication</li>
            <li><strong>Vercel:</strong> Hosting and analytics</li>
            <li><strong>Stripe:</strong> Payment processing</li>
            <li><strong>Resend:</strong> Email delivery</li>
            <li><strong>OpenAI:</strong> Content moderation</li>
          </ul>
          <p className="text-sm text-neutral-700 mb-4">
            These services have their own privacy policies governing their use of data.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">10. Children&apos;s Privacy</h2>
          <p className="text-sm text-neutral-700 mb-4">
            Our services are not intended for children under 13. We do not knowingly collect personal
            information from children under 13. If you believe we have collected such information,
            please contact us immediately.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">11. International Users</h2>
          <p className="text-sm text-neutral-700 mb-4">
            Our services are hosted in the United States. If you access our services from outside
            the United States, your information may be transferred to and processed in the United States.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">12. Changes to This Policy</h2>
          <p className="text-sm text-neutral-700 mb-4">
            We may update this Privacy Policy from time to time. We will notify you of any material
            changes by posting the new policy on this page with an updated date.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">13. Contact Us</h2>
          <p className="text-sm text-neutral-700 mb-4">
            If you have any questions about this Privacy Policy, please contact us at:
          </p>
          <p className="text-sm text-neutral-700">
            Email: privacy@readflaneur.com
          </p>
        </section>
      </div>
    </div>
  );
}
