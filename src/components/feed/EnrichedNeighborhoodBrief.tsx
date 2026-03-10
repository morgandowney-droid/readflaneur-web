'use client';

import { useState, ReactNode } from 'react';

interface StorySource {
  name: string;
  url: string;
}

interface EnrichedStory {
  entity: string;
  source: StorySource | null;
  context: string;
  note?: string;
  googleFallbackUrl: string;
}

interface EnrichedCategory {
  name: string;
  stories: EnrichedStory[];
}

interface EnrichedNeighborhoodBriefProps {
  headline: string;
  originalContent: string;
  categories: EnrichedCategory[];
  generatedAt: string;
  neighborhoodName: string;
  city?: string;
}

function formatTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) {
    return 'Just now';
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

// Category icons
const categoryIcons: Record<string, string> = {
  'Food & Dining': '🍽️',
  'Retail & Fashion': '🛍️',
  'Real Estate': '🏗️',
  'Real Estate & Development': '🏗️',
  'Events': '📅',
  'Events & Culture': '🎭',
  'Local Incidents': '⚠️',
  'Local News': '📰',
};

/**
 * Clean content by stripping HTML tags
 */
function renderWithLinks(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let lastIndex = 0;
  let match;
  let keyIndex = 0;

  while ((match = linkPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <a key={`elink-${keyIndex++}`} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-current underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-solid hover:decoration-neutral-300/60">
        {match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function cleanContent(text: string): string {
  return text
    // Convert HTML <a> tags to markdown links (preserves hyperlinks for rendering)
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '[$2]($1)')
    // Strip other common HTML tags
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|span|strong|em|b|i)[^>]*>/gi, '')
    .trim();
}

export function EnrichedNeighborhoodBrief({
  headline,
  originalContent,
  categories,
  generatedAt,
  neighborhoodName,
}: EnrichedNeighborhoodBriefProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSources, setShowSources] = useState(false);

  // Clean HTML from content
  const cleanedContent = cleanContent(originalContent);

  // Count total stories and sources
  const totalStories = categories.reduce((sum, cat) => sum + cat.stories.length, 0);
  const storiesWithSources = categories.reduce(
    (sum, cat) => sum + cat.stories.filter(s => s.source !== null).length,
    0
  );

  return (
    <div className="bg-gradient-to-br from-accent/5 to-accent/10 border border-accent/20 rounded-lg p-4 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-accent">
            What&apos;s Happening Today Live
          </span>
          {storiesWithSources > 0 && (
            <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">
              {storiesWithSources} sources
            </span>
          )}
        </div>
        <span className="text-xs text-accent">
          {formatTime(generatedAt)}
        </span>
      </div>

      {/* Headline */}
      <h3 className="font-semibold text-lg mb-3 text-neutral-900">
        {headline}
      </h3>

      {/* Original Brief Content (collapsed view) */}
      {!showSources && (
        <div className="text-base text-neutral-700 leading-relaxed mb-3">
          <p>
            {isExpanded
              ? renderWithLinks(cleanedContent)
              : <>
                  {renderWithLinks(cleanedContent.slice(0, 200))}
                  {cleanedContent.length > 200 ? '...' : ''}
                </>
            }
          </p>
          {cleanedContent.length > 200 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 text-xs font-medium text-accent hover:text-accent/80 transition-colors"
            >
              {isExpanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}

      {/* Enriched Sources View */}
      {showSources && (
        <div className="space-y-4 mb-3">
          {categories.map((category, catIdx) => (
            <div key={catIdx}>
              <h4 className="text-xs font-semibold text-accent uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <span>{categoryIcons[category.name] || '📌'}</span>
                {category.name}
              </h4>
              <div className="space-y-3">
                {category.stories.map((story, storyIdx) => (
                  <div
                    key={storyIdx}
                    className="bg-white/5 rounded-md p-3 border border-accent/30"
                  >
                    {/* Entity name */}
                    <div className="font-medium text-sm text-fg mb-1">
                      {story.entity}
                    </div>

                    {/* Source link */}
                    <div className="text-xs mb-1.5">
                      {story.source ? (
                        <a
                          href={story.source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-neutral-300/60 hover:decoration-solid transition-all"
                          onClick={(e) => e.stopPropagation()}
                        >
                          📎 {story.source.name}
                        </a>
                      ) : (
                        <a
                          href={story.googleFallbackUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-fg-subtle hover:text-neutral-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          🔍 Search Google
                        </a>
                      )}
                    </div>

                    {/* Context */}
                    <p className="text-xs text-fg-subtle leading-relaxed">
                      {story.context}
                    </p>

                    {/* Note/caveat */}
                    {story.note && (
                      <p className="text-[10px] text-accent mt-1 italic">
                        Note: {story.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toggle between views */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-accent/20">
        <button
          onClick={() => setShowSources(!showSources)}
          className="text-xs font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-1"
        >
          {showSources ? (
            <>
              <span>←</span> Back to brief
            </>
          ) : (
            <>
              <span>📚</span> View {storiesWithSources} verified sources
            </>
          )}
        </button>
      </div>

      {/* Footer attribution */}
      <div className="mt-2 pt-2 border-t border-accent/20">
        <p className="text-[10px] text-accent">
          Powered by Flâneur real-time local intel • Sources verified by AI
        </p>
      </div>
    </div>
  );
}

/**
 * Demo component to preview the enriched brief
 */
export function EnrichedBriefDemo() {
  const demoData: EnrichedNeighborhoodBriefProps = {
    headline: "Östermalm Chills with Skating, Lights, and Mega Builds",
    originalContent: `Folks in Östermalm, brace for a frosty thrill today at Kungsträdgården. Östermalms konståkningsklubb is hosting a "prova på" skating try-out and show from 16:30 to 17:30, amid the ongoing "Success at a Gallop" light exhibition running through February 28. Meanwhile, cozy up at Östermalms Saluhall where Bistrot du Passage is earning rave reviews. Development buzz is heating up: Ericsson's old offices are transforming into 850 swanky apartments. No splashy restaurant debuts today, but whispers of a new bakery-cafe by chef Stefan Ekengren this month have us salivating.`,
    generatedAt: new Date().toISOString(),
    neighborhoodName: "Östermalm",
    city: "Stockholm",
    categories: [
      {
        name: "Food & Dining",
        stories: [
          {
            entity: "Eken Bageri & Kökscafé (Opens Feb 9)",
            source: { name: "Thatsup", url: "https://thatsup.se/stockholm/article/stefan-ekengren-oppnar-cafe" },
            context: "Chef Stefan Ekengren is opening \"Eken Bageri & Kökscafé\" at Sturegatan 17 in Östermalm. The planned opening date is February 9. The bakery and café will offer artisan breads, Swedish pastries, and high-quality sandwiches.",
            googleFallbackUrl: "https://google.com/search?q=Stefan+Ekengren+Eken+Östermalm",
          },
          {
            entity: "Bistrot du Passage (Östermalms Saluhall)",
            source: { name: "Östermalms Saluhall", url: "https://ostermalmshallen.se/bistrot-du-passage" },
            context: "French bistro in Östermalms Saluhall offering classic bistro dishes. Rated 4.6/5 on Google with praise for warm ambiance and attentive service.",
            googleFallbackUrl: "https://google.com/search?q=Bistrot+du+Passage+Östermalm",
          },
        ],
      },
      {
        name: "Real Estate & Development",
        stories: [
          {
            entity: "Square Garden (853 Apartments)",
            source: { name: "Mitt i", url: "https://mitti.se/nyheter/har-blir-ericssonkontor-850-lagenheter" },
            context: "Ericsson's old offices (GSM-borgen) at Jan Stenbecks torg are being converted into 853 apartments. Features include rooftop terraces, cinema room, and yoga room. First phase of ~440 rental apartments expected in 2026, with ~430 co-ops in 2027.",
            note: "Location is in Kista, adjacent to Östermalm.",
            googleFallbackUrl: "https://google.com/search?q=Ericsson+Square+Garden+apartments",
          },
        ],
      },
      {
        name: "Events & Culture",
        stories: [
          {
            entity: "Success at a Gallop Light Exhibition",
            source: { name: "Kungsträdgården", url: "https://kungstradgarden.stockholm/evenemang" },
            context: "Light exhibition celebrating the Chinese Year of the Horse, running February 1-28 at Kungsträdgården. The pond is illuminated nightly.",
            googleFallbackUrl: "https://google.com/search?q=Success+at+a+Gallop+Kungsträdgården",
          },
        ],
      },
      {
        name: "Local Incidents",
        stories: [
          {
            entity: "Dog Attack on Gyllenstiernsgatan",
            source: { name: "Mitt i", url: "https://mitti.se/nyheter/hund-avlivas-efter-attack-pa-ostermalm" },
            context: "The County Administrative Board decided to put down a dog after an attack on Gyllenstiernsgatan in Östermalm, reported on February 1, 2026.",
            googleFallbackUrl: "https://google.com/search?q=dog+attack+Gyllenstiernsgatan+Östermalm",
          },
          {
            entity: "Fire Near Valhallavägen",
            source: { name: "Mitt i", url: "https://mitti.se/nyheter/brand-pa-ostermalm" },
            context: "A fire occurred on Sibyllegatan, between Valhallavägen and Östermalmsgatan, resulting in one person hospitalized with smoke and burn injuries.",
            googleFallbackUrl: "https://google.com/search?q=fire+Valhallavägen+Östermalm",
          },
        ],
      },
    ],
  };

  return <EnrichedNeighborhoodBrief {...demoData} />;
}
