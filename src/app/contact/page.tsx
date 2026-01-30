import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact | Flâneur',
  description: 'Get in touch with Flâneur. We\'d love to hear from you.',
};

export default function ContactPage() {
  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-light tracking-wide mb-8">Contact Us</h1>

        <p className="text-neutral-700 mb-8">
          We&apos;d love to hear from you. Whether you have a question, feedback, or just want to say hello.
        </p>

        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-medium mb-3">General Inquiries</h2>
            <p className="text-sm text-neutral-700">
              For general questions and feedback:{' '}
              <a href="mailto:contact@readflaneur.com" className="text-black underline hover:no-underline">
                contact@readflaneur.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-3">Got a Tip?</h2>
            <p className="text-sm text-neutral-700 mb-3">
              Know something happening in your neighborhood? We&apos;re all ears.
            </p>
            <p className="text-sm text-neutral-700">
              Use our{' '}
              <Link href="/" className="text-black underline hover:no-underline">
                tip submission form
              </Link>{' '}
              or email us at{' '}
              <a href="mailto:tips@readflaneur.com" className="text-black underline hover:no-underline">
                tips@readflaneur.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-3">Advertising</h2>
            <p className="text-sm text-neutral-700">
              Interested in reaching our readers?{' '}
              <Link href="/advertise" className="text-black underline hover:no-underline">
                Learn about advertising
              </Link>{' '}
              or contact{' '}
              <a href="mailto:ads@readflaneur.com" className="text-black underline hover:no-underline">
                ads@readflaneur.com
              </a>
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
