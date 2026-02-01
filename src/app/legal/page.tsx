'use client';

import { useState } from 'react';

type Tab = 'privacy' | 'terms';

export default function LegalPage() {
  const [activeTab, setActiveTab] = useState<Tab>('privacy');

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-light tracking-wide mb-8">Legal</h1>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-neutral-200 mb-8">
          <button
            onClick={() => setActiveTab('privacy')}
            className={`pb-3 text-sm transition-colors ${
              activeTab === 'privacy'
                ? 'border-b-2 border-black text-black font-medium'
                : 'text-neutral-500 hover:text-black'
            }`}
          >
            Privacy Policy
          </button>
          <button
            onClick={() => setActiveTab('terms')}
            className={`pb-3 text-sm transition-colors ${
              activeTab === 'terms'
                ? 'border-b-2 border-black text-black font-medium'
                : 'text-neutral-500 hover:text-black'
            }`}
          >
            Terms of Service
          </button>
        </div>

        {/* Content */}
        <div className="prose prose-neutral">
          {activeTab === 'privacy' ? <PrivacyContent /> : <TermsContent />}
        </div>
      </div>
    </div>
  );
}

function PrivacyContent() {
  return (
    <>
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
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">3. How We Use Your Information</h2>
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
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">5. Your Rights</h2>
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
          To exercise these rights, please contact us at contact@readflaneur.com.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">6. Security</h2>
        <p className="text-sm text-neutral-700 mb-4">
          We implement appropriate technical and organizational measures to protect your personal
          information, including encryption, access controls, and secure data storage.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">7. Contact Us</h2>
        <p className="text-sm text-neutral-700">
          If you have any questions about this Privacy Policy, please contact us at contact@readflaneur.com.
        </p>
      </section>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <p className="text-sm text-neutral-500 mb-8">
        Last updated: January 2026
      </p>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">1. Acceptance of Terms</h2>
        <p className="text-sm text-neutral-700 mb-4">
          By accessing or using Flâneur (&quot;the Service&quot;), you agree to be bound by these Terms of Service.
          If you do not agree to these terms, please do not use our Service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">2. Description of Service</h2>
        <p className="text-sm text-neutral-700 mb-4">
          Flâneur is a local news platform that provides neighborhood-focused journalism and allows
          community members to submit news tips, photos, and other content for editorial consideration.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">3. User Submission Terms</h2>
        <p className="text-sm text-neutral-700 mb-4">
          By submitting content to Flâneur, you grant us a perpetual, worldwide, royalty-free, non-exclusive
          license to use, reproduce, modify, adapt, publish, translate, create derivative works from,
          distribute, perform, and display your submitted content in any media format.
        </p>
        <p className="text-sm text-neutral-700 mb-2">
          By submitting content, you represent and warrant that:
        </p>
        <ul className="text-sm text-neutral-700 list-disc pl-6 mb-4 space-y-1">
          <li>You are the original creator of the content or have obtained all necessary permissions</li>
          <li>The content does not infringe upon any third party&apos;s intellectual property rights</li>
          <li>The content is accurate to the best of your knowledge</li>
          <li>The content does not contain defamatory, obscene, or unlawful material</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">4. Prohibited Conduct</h2>
        <ul className="text-sm text-neutral-700 list-disc pl-6 mb-4 space-y-1">
          <li>Submit false, misleading, or fabricated information</li>
          <li>Impersonate any person or entity</li>
          <li>Harass, threaten, or intimidate other users</li>
          <li>Submit content that is illegal, harmful, or violates third-party rights</li>
          <li>Attempt to gain unauthorized access to our systems</li>
          <li>Use automated tools to scrape or collect data</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">5. Intellectual Property</h2>
        <p className="text-sm text-neutral-700 mb-4">
          All content on Flâneur, except user-submitted content, is the property of Flâneur or its
          licensors and is protected by copyright, trademark, and other intellectual property laws.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">6. Disclaimer of Warranties</h2>
        <p className="text-sm text-neutral-700 mb-4">
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND,
          EITHER EXPRESS OR IMPLIED.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">7. Limitation of Liability</h2>
        <p className="text-sm text-neutral-700 mb-4">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, FLÂNEUR SHALL NOT BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">8. Governing Law</h2>
        <p className="text-sm text-neutral-700 mb-4">
          These terms shall be governed by and construed in accordance with the laws of the State of
          New York.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-4">9. Contact</h2>
        <p className="text-sm text-neutral-700">
          If you have any questions about these Terms of Service, please contact us at contact@readflaneur.com.
        </p>
      </section>
    </>
  );
}
