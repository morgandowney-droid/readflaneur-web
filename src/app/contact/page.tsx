import Link from 'next/link';
import { NeighborhoodSuggestionForm } from '@/components/NeighborhoodSuggestionForm';

export default function ContactPage() {
  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-light tracking-wide mb-8">Contact Us</h1>

        <p className="text-neutral-400 mb-8">
          We&apos;d love to hear from you. Whether you have a question, feedback, or just want to say hello.
        </p>

        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-medium mb-3">General Inquiries</h2>
            <p className="text-sm text-neutral-400">
              For general questions and feedback:{' '}
              <a href="mailto:contact@readflaneur.com" className="text-neutral-100 underline decoration-neutral-600 hover:text-white">
                contact@readflaneur.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-3">Tips & Suggestions</h2>
            <p className="text-sm text-neutral-400 mb-3">
              Know something happening in your neighborhood? Have an idea for a story? We&apos;re all ears.
            </p>
            <p className="text-sm text-neutral-400">
              Email us at{' '}
              <a href="mailto:tips@readflaneur.com" className="text-neutral-100 underline decoration-neutral-600 hover:text-white">
                tips@readflaneur.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-3">Suggest a Neighborhood</h2>
            <p className="text-sm text-neutral-400 mb-4">
              Don&apos;t see your neighborhood on Flaneur? Let us know which neighborhood you&apos;d like us to add.
            </p>
            <NeighborhoodSuggestionForm variant="full" />
          </section>

          <section>
            <h2 className="text-lg font-medium mb-3">Advertising</h2>
            <p className="text-sm text-neutral-400">
              Interested in reaching our readers?{' '}
              <Link href="/advertise" className="text-neutral-100 underline decoration-neutral-600 hover:text-white">
                Learn about advertising
              </Link>{' '}
              or contact{' '}
              <a href="mailto:ads@readflaneur.com" className="text-neutral-100 underline decoration-neutral-600 hover:text-white">
                ads@readflaneur.com
              </a>
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
