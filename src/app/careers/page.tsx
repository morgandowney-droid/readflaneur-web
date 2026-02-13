export const metadata = {
  title: 'Write for Flâneur | Neighborhood Editor',
  description: 'Join Flâneur as a Neighborhood Editor. Be the eyes and ears of your neighborhood.',
};

export default function CareersPage() {
  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-12">
          <p className="text-xs tracking-[0.3em] uppercase text-fg-muted mb-4">
            Join Flâneur
          </p>
          <h1 className="text-4xl font-light leading-tight mb-6">
            Neighborhood Editor
          </h1>
          <p className="text-lg text-fg-muted">
            Freelance / Part-Time · ~5 hours/week · Monthly Retainer
          </p>
        </div>

        {/* About */}
        <section className="mb-12">
          <p className="text-fg-muted leading-relaxed mb-6">
            Flâneur is a new mobile news product launching simultaneously in various cities globally.
            We are "local intel meets AI" for the world's most vibrant neighborhoods.
          </p>
          <p className="text-fg-muted leading-relaxed">
            We are looking for a <strong>Neighborhood Editor</strong> to be our eyes and ears on the ground.
            You are not aggregating press releases. You are walking the pavement. You will curate a daily
            feed of highly visual, hyper-local intelligence for affluent residents.
          </p>
        </section>

        {/* The Role */}
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.2em] uppercase text-fg-muted mb-4">
            The Role
          </h2>
          <div className="bg-surface border border-border p-6">
            <p className="text-fg-muted leading-relaxed italic">
              "You aren't writing long essays. You are walking the neighborhood, snapping photos of
              new store openings, spotting trends, and tracking local real estate. You are the eyes
              and ears of your neighborhood."
            </p>
          </div>
        </section>

        {/* What You Will Do */}
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.2em] uppercase text-fg-muted mb-4">
            What You Will Do
          </h2>
          <ul className="space-y-4">
            <li className="flex gap-4">
              <span className="text-fg-muted font-light">01</span>
              <div>
                <p className="font-medium mb-1">Walk the beat</p>
                <p className="text-sm text-fg-muted">
                  Spend time walking the neighborhood 2-3 times a week.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="text-fg-muted font-light">02</span>
              <div>
                <p className="font-medium mb-1">Spot the details</p>
                <p className="text-sm text-fg-muted">
                  Notice the new bakery opening, the renovation starting down the street,
                  or the change in local parking rules.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="text-fg-muted font-light">03</span>
              <div>
                <p className="font-medium mb-1">Snap and send</p>
                <p className="text-sm text-fg-muted">
                  Take high-quality photos on your phone and write 2-3 sentence "briefs" about what you see.
                  A typical article contains 1-5 photos.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="text-fg-muted font-light">04</span>
              <div>
                <p className="font-medium mb-1">No long essays</p>
                <p className="text-sm text-fg-muted">
                  We value speed, wit, and aesthetics over word count. The average article is 300 words,
                  ranging from 100-600 words. A single article may contain a series of brief updates or stories.
                </p>
              </div>
            </li>
          </ul>
        </section>

        {/* Who You Are */}
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.2em] uppercase text-fg-muted mb-4">
            Who You Are
          </h2>
          <ul className="space-y-4">
            <li className="flex gap-4">
              <span className="w-2 h-2 bg-white rounded-full mt-2 flex-shrink-0"></span>
              <div>
                <p className="font-medium mb-1">A Local</p>
                <p className="text-sm text-fg-muted">
                  You must live in or within walking distance of the neighborhood. Zip code verification required.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="w-2 h-2 bg-white rounded-full mt-2 flex-shrink-0"></span>
              <div>
                <p className="font-medium mb-1">Visual</p>
                <p className="text-sm text-fg-muted">
                  You know how to frame a photo. Must have an iPhone 13 Pro or better—photography is 50% of the job.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="w-2 h-2 bg-white rounded-full mt-2 flex-shrink-0"></span>
              <div>
                <p className="font-medium mb-1">Connected</p>
                <p className="text-sm text-fg-muted">
                  You know which restaurants are cool before they open.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="w-2 h-2 bg-white rounded-full mt-2 flex-shrink-0"></span>
              <div>
                <p className="font-medium mb-1">Opinionated</p>
                <p className="text-sm text-fg-muted">
                  You have strong opinions about local coffee and architecture.
                </p>
              </div>
            </li>
          </ul>
        </section>

        {/* Apply */}
        <section className="border-t border-border pt-12">
          <h2 className="text-xs tracking-[0.2em] uppercase text-fg-muted mb-4">
            To Apply
          </h2>
          <p className="text-fg-muted leading-relaxed mb-6">
            Email{' '}
            <a href="mailto:editors@readflaneur.com?subject=Neighborhood Editor Application" className="text-fg underline decoration-neutral-600 hover:text-fg">
              editors@readflaneur.com
            </a>
            {' '}with subject: "Neighborhood Editor Application" and:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-fg-muted">
            <li>One paragraph about yourself</li>
            <li>Which neighborhood you want to cover</li>
            <li><strong>The Test:</strong> Attach 2 photos of your neighborhood taken today</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
