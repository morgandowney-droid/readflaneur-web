'use client';

type PlacementAction = 'daily_brief' | 'sunday_edition' | 'global_takeover';

const PERSONAS = [
  {
    title: 'The Local Pillar',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="w-8 h-8"
      >
        <path d="M3 21h18" />
        <path d="M5 21V7l8-4v18" />
        <path d="M19 21V11l-6-4" />
        <path d="M9 9v.01" />
        <path d="M9 12v.01" />
        <path d="M9 15v.01" />
        <path d="M9 18v.01" />
      </svg>
    ),
    who: 'Real Estate Agents, Galleries, Restaurants.',
    goal: 'Dominate the Neighborhood.',
    play: "Don\u2019t pay for reach you don\u2019t need. Own your specific zip code with 100% Share of Voice.",
    recommended: 'Daily Brief: Superprime ($500/day)',
    badge: 'Best for Real Estate',
    highlight: true,
    action: 'daily_brief' as PlacementAction,
  },
  {
    title: 'The National Trust',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="w-8 h-8"
      >
        <path d="M3 21h18" />
        <path d="M3 10h18" />
        <path d="M5 6l7-3 7 3" />
        <path d="M4 10v11" />
        <path d="M20 10v11" />
        <path d="M8 14v4" />
        <path d="M12 14v4" />
        <path d="M16 14v4" />
      </svg>
    ),
    who: 'Wealth Management, Interior Design, Private Banking.',
    goal: 'Build Long-Term Authority.',
    play: 'Trust is built on frequency. Sponsor the Daily Brief consistently to become a fixture in the morning routine.',
    recommended: 'Daily Brief: Metropolitan Bundle ($200/day)',
    badge: null,
    highlight: false,
    action: 'daily_brief' as PlacementAction,
  },
  {
    title: 'The Global Icon',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="w-8 h-8"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        <path d="M2 12h20" />
      </svg>
    ),
    who: 'Luxury Automotive, High Fashion, Tech Majors.',
    goal: 'Bypass the Algorithm.',
    play: "Speak directly to the \u2018Flaneur\u2019 demographic across London, New York, and Stockholm simultaneously.",
    recommended: 'Global Network Takeover ($15k/each Sunday)',
    badge: null,
    highlight: false,
    action: 'sunday_edition' as PlacementAction,
  },
] as const;

function handleRecommendedClick(action: PlacementAction) {
  if (action === 'global_takeover') {
    // Scroll to Global Takeover section (it's after collections)
    const el = document.querySelector('[href="mailto:ads@readflaneur.com?subject=Global%20Takeover%20Inquiry"]');
    if (el) el.closest('section')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  // Scroll to collections and set placement
  const collections = document.getElementById('collections');
  if (collections) {
    collections.scrollIntoView({ behavior: 'smooth' });
    // Dispatch event after a short delay so the scroll is visible first
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('placement-select', { detail: action }));
    }, 300);
  }
}

export function AdvertiserPersonas() {
  return (
    <section className="px-4 pb-20">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-[family-name:var(--font-cormorant)] text-3xl md:text-4xl font-light text-center mb-3">
          Choose Your Strategy.
        </h2>
        <p className="text-neutral-400 text-base text-center mb-12 max-w-2xl mx-auto leading-relaxed">
          From corner stores to global conglomerates, Flaneur offers a distinct lever for growth.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PERSONAS.map((persona) => (
            <div
              key={persona.title}
              className={`relative bg-neutral-900 border p-8 flex flex-col ${
                persona.highlight
                  ? 'border-amber-700/50 shadow-[0_0_30px_-5px_rgba(217,169,78,0.12)]'
                  : 'border-neutral-800'
              }`}
            >
              {persona.badge && (
                <span className="absolute -top-3 left-6 bg-amber-700/90 text-white text-[10px] tracking-[0.2em] uppercase px-3 py-1">
                  {persona.badge}
                </span>
              )}

              <div className="text-neutral-300 mb-5">{persona.icon}</div>

              <h3 className="font-[family-name:var(--font-cormorant)] text-2xl font-light mb-4">
                {persona.title}
              </h3>

              <p className="text-xs tracking-[0.15em] uppercase text-neutral-500 mb-1">
                Who
              </p>
              <p className="text-sm text-neutral-300 mb-4 leading-relaxed">
                {persona.who}
              </p>

              <p className="text-xs tracking-[0.15em] uppercase text-neutral-500 mb-1">
                The Goal
              </p>
              <p className="text-sm text-white font-medium mb-4">
                {persona.goal}
              </p>

              <p className="text-xs tracking-[0.15em] uppercase text-neutral-500 mb-1">
                The Play
              </p>
              <p className="text-sm text-neutral-400 mb-6 leading-relaxed flex-1">
                {persona.play}
              </p>

              <div className="border-t border-neutral-800 pt-4">
                <p className="text-xs tracking-[0.15em] uppercase text-neutral-600 mb-1">
                  Recommended
                </p>
                <button
                  onClick={() => handleRecommendedClick(persona.action)}
                  className="text-sm text-amber-500/90 font-medium hover:text-amber-400 transition-colors cursor-pointer text-left"
                >
                  {persona.recommended}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
