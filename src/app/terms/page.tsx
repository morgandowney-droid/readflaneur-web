import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | Flâneur',
  description: 'Terms of service for using Flâneur, including user submission terms.',
};

export default function TermsPage() {
  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-2xl prose prose-neutral">
        <h1 className="text-2xl font-light tracking-wide mb-8">Terms of Service</h1>

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
            By submitting content to Flâneur through our tip submission feature, you agree to the following:
          </p>

          <h3 className="text-base font-medium mt-6 mb-3">3.1 License Grant</h3>
          <p className="text-sm text-neutral-700 mb-4">
            You grant Flâneur a perpetual, worldwide, royalty-free, non-exclusive license to use, reproduce,
            modify, adapt, publish, translate, create derivative works from, distribute, perform, and display
            your submitted content in any media format and through any media channels. This includes the right
            to edit, crop, or otherwise modify photos and text for publication purposes.
          </p>

          <h3 className="text-base font-medium mt-6 mb-3">3.2 Representations and Warranties</h3>
          <p className="text-sm text-neutral-700 mb-2">
            By submitting content, you represent and warrant that:
          </p>
          <ul className="text-sm text-neutral-700 list-disc pl-6 mb-4 space-y-1">
            <li>You are the original creator of the content or have obtained all necessary permissions</li>
            <li>The content does not infringe upon any third party&apos;s copyright, trademark, or other intellectual property rights</li>
            <li>Any persons depicted in photos have consented to their image being used</li>
            <li>The content is accurate to the best of your knowledge</li>
            <li>The content does not contain defamatory, obscene, or unlawful material</li>
            <li>You have the right and authority to grant the license described above</li>
          </ul>

          <h3 className="text-base font-medium mt-6 mb-3">3.3 No Obligation to Use</h3>
          <p className="text-sm text-neutral-700 mb-4">
            Flâneur is under no obligation to use, publish, or acknowledge any submitted content.
            We reserve the right to reject, remove, or modify any submission at our sole discretion.
          </p>

          <h3 className="text-base font-medium mt-6 mb-3">3.4 Credit and Attribution</h3>
          <p className="text-sm text-neutral-700 mb-4">
            If you provide contact information and indicate your credit preferences, we may credit you
            according to your stated preferences. However, we reserve the right to publish content
            without attribution or with modified attribution as appropriate for the publication context.
          </p>

          <h3 className="text-base font-medium mt-6 mb-3">3.5 No Compensation</h3>
          <p className="text-sm text-neutral-700 mb-4">
            Unless otherwise agreed in writing, submitted content is provided voluntarily and without
            expectation of payment or other compensation.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">4. User Accounts</h2>
          <p className="text-sm text-neutral-700 mb-4">
            Some features of the Service may require you to create an account. You are responsible for
            maintaining the confidentiality of your account credentials and for all activities that occur
            under your account.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">5. Prohibited Conduct</h2>
          <p className="text-sm text-neutral-700 mb-2">
            You agree not to:
          </p>
          <ul className="text-sm text-neutral-700 list-disc pl-6 mb-4 space-y-1">
            <li>Submit false, misleading, or fabricated information</li>
            <li>Impersonate any person or entity</li>
            <li>Harass, threaten, or intimidate other users</li>
            <li>Submit content that is illegal, harmful, or violates third-party rights</li>
            <li>Attempt to gain unauthorized access to our systems</li>
            <li>Use automated tools to scrape or collect data</li>
            <li>Interfere with the proper functioning of the Service</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">6. Content Moderation</h2>
          <p className="text-sm text-neutral-700 mb-4">
            We reserve the right to review, moderate, and remove any content that violates these terms
            or that we deem inappropriate for any reason. Content may be reviewed using automated systems
            and human moderators.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">7. Intellectual Property</h2>
          <p className="text-sm text-neutral-700 mb-4">
            All content on Flâneur, except user-submitted content, is the property of Flâneur or its
            licensors and is protected by copyright, trademark, and other intellectual property laws.
            The Flâneur name, logo, and all related names, logos, and designs are trademarks of Flâneur.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">8. Disclaimer of Warranties</h2>
          <p className="text-sm text-neutral-700 mb-4">
            THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND,
            EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY,
            FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">9. Limitation of Liability</h2>
          <p className="text-sm text-neutral-700 mb-4">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, FLÂNEUR SHALL NOT BE LIABLE FOR ANY INDIRECT,
            INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATING TO
            YOUR USE OF THE SERVICE.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">10. Indemnification</h2>
          <p className="text-sm text-neutral-700 mb-4">
            You agree to indemnify and hold harmless Flâneur and its officers, directors, employees,
            and agents from any claims, damages, losses, or expenses arising from your use of the Service
            or your violation of these terms.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">11. Changes to Terms</h2>
          <p className="text-sm text-neutral-700 mb-4">
            We may update these terms from time to time. We will notify you of any material changes
            by posting the new terms on this page with an updated &quot;Last updated&quot; date.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">12. Governing Law</h2>
          <p className="text-sm text-neutral-700 mb-4">
            These terms shall be governed by and construed in accordance with the laws of the State of
            New York, without regard to its conflict of law provisions.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-medium mb-4">13. Contact</h2>
          <p className="text-sm text-neutral-700 mb-4">
            If you have any questions about these Terms of Service, please contact us at
            legal@readflaneur.com.
          </p>
        </section>
      </div>
    </div>
  );
}
