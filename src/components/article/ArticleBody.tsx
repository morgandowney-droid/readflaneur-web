'use client';

import { ReactNode } from 'react';
import { isEventLine } from '@/lib/look-ahead-events';

interface ArticleBodyProps {
  content: string;
  neighborhoodName: string;
  city: string;
}

export function ArticleBody({ content, neighborhoodName, city }: ArticleBodyProps) {
  // Strip all links (HTML and markdown) from content, keeping just the text
  let cleanedContent = content
    // Strip teaser labels that Gemini outputs as prose (for email/subject only, not display)
    .replace(/^(?:SUBJECT|subject)[_ ](?:TEASER|teaser):.*$/gm, '')
    .replace(/^(?:EMAIL|email)[_ ](?:TEASER|teaser):.*$/gm, '')
    // Strip raw Grok search result objects that leak into content
    .replace(/\{['"](?:title|url|snippet|author|published_at)['"]:[^}]*(?:\}|$)/gm, '')
    // Convert HTML <a> tags to markdown links (preserves hyperlinks for rendering)
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '[$2]($1)')
    // Strip any other HTML tags that may have been generated
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|span|strong|em|b|i)[^>]*>/gi, '')
    // Clean content: remove citation markers and bare URLs (but preserve URLs inside markdown links)
    .replace(/\[\[\d+\]\]/g, '')
    .replace(/(?<!\]\()https?:\/\/\S+/g, '')
    // Replace em dashes with period and space
    .replace(/\s*—\s*/g, '. ')
    // Fix double periods
    .replace(/\.\.\s*/g, '. ')
    .trim();

  // Split event listing from prose body at --- separator
  let eventListingBlock: string | null = null;
  let proseContent = cleanedContent;

  const separatorMatch = cleanedContent.match(/^\[\[Event Listing\]\]\s*([\s\S]*?)\n---\s*\n/);
  if (separatorMatch) {
    eventListingBlock = separatorMatch[1].trim();
    proseContent = cleanedContent.substring(separatorMatch[0].length).trim();
  }

  // Insert paragraph breaks before section headers [[...]]
  // This ensures headers get their own line/block
  proseContent = proseContent.replace(/\s*(\[\[[^\]]+\]\])\s*/g, '\n\n$1\n\n');

  // Also insert paragraph breaks after sentences that end with ]] (header followed by content)
  proseContent = proseContent.replace(/\]\]\s+([A-Z])/g, ']]\n\n$1');

  // Split into paragraphs - handle both \n\n and single \n
  const rawParagraphs = proseContent
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Split long paragraphs on sentence boundaries (~2-3 sentences each).
  // Look Ahead articles often have one giant paragraph per day section with
  // multiple events crammed together. This breaks them into readable chunks.
  const paragraphs: string[] = [];
  for (const para of rawParagraphs) {
    // Skip headers and short paragraphs
    if (para.match(/^\[\[/) || para.length <= 400) {
      paragraphs.push(para);
      continue;
    }
    const sentences = para.split(/(?<=[.!?])\s+(?=[A-Z])/);
    let currentPara = '';
    for (const sentence of sentences) {
      if (currentPara.length + sentence.length > 300 && currentPara.length > 0) {
        paragraphs.push(currentPara.trim());
        currentPara = sentence;
      } else {
        currentPara += (currentPara ? ' ' : '') + sentence;
      }
    }
    if (currentPara.trim()) {
      paragraphs.push(currentPara.trim());
    }
  }

  const pClass = 'text-fg text-[1.2rem] md:text-[1.35rem] leading-loose mb-8';

  // Render function that handles strong tags and markdown links
  const renderParts = (text: string): ReactNode[] => {
    const result: ReactNode[] = [];
    // Split on both <strong> tags and markdown links [text](url)
    const parts = text.split(/(<strong>[^<]+<\/strong>|\[[^\]]+\]\(https?:\/\/[^)]+\))/);

    parts.forEach((part, partIdx) => {
      const strongMatch = part.match(/<strong>([^<]+)<\/strong>/);
      const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      if (strongMatch) {
        result.push(<strong key={`strong-${partIdx}`} className="font-bold text-fg">{strongMatch[1]}</strong>);
      } else if (linkMatch) {
        result.push(
          <a key={`link-${partIdx}`} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-solid hover:decoration-neutral-300/60">
            {linkMatch[1]}
          </a>
        );
      } else if (part) {
        result.push(part);
      }
    });

    return result;
  };

  return (
    <article className="max-w-none" style={{ fontFamily: 'var(--font-body-serif)' }}>
      {/* Compact event listing block */}
      {eventListingBlock && (
        <EventListingBlock content={eventListingBlock} />
      )}

      {/* Prose body */}
      {paragraphs.map((paragraph, index) => {
        // Check if this is a section header (wrapped in [[ ]])
        const headerMatch = paragraph.match(/^\[\[([^\]]+)\]\]$/);
        if (headerMatch) {
          return (
            <h3 key={index} className="text-xl font-semibold text-fg mt-10 mb-6" style={{ fontFamily: 'var(--font-body-serif)' }}>
              {headerMatch[1]}
            </h3>
          );
        }

        // Process bold markers
        const processedParagraph = paragraph.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Render content with line breaks preserved
        const lines = processedParagraph.split(/  \n|\n/);
        const rendered: ReactNode[] = [];
        lines.forEach((line, lineIdx) => {
          if (lineIdx > 0) rendered.push(<br key={`br-${lineIdx}`} />);
          rendered.push(...renderParts(line));
        });

        return (
          <p key={index} className={pClass}>
            {rendered}
          </p>
        );
      })}
    </article>
  );
}

/**
 * Compact event listing rendered as a tight block above prose.
 * Parses [[Day, Date]] headers and semicolon-separated event lines.
 */
function EventListingBlock({ content }: { content: string }) {
  const lines = content.split(/\n\n+/).map(l => l.trim()).filter(Boolean);

  return (
    <div className="mb-10 pb-8 border-b border-border" style={{ fontFamily: 'var(--font-body-serif)' }}>
      <p className="text-[10px] uppercase tracking-[0.25em] text-fg-subtle mb-4" style={{ fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>At a glance</p>
      <div className="space-y-2">
        {lines.map((line, i) => {
          // Date header [[Today, Sat Feb 21]]
          const headerMatch = line.match(/^\[\[(.+)\]\]$/);
          if (headerMatch) {
            return (
              <p key={i} className={`text-sm font-semibold text-fg uppercase tracking-widest ${i > 0 ? 'mt-4' : ''}`}>
                {headerMatch[1]}
              </p>
            );
          }

          // Event line with semicolons
          if (isEventLine(line)) {
            const segments = line.replace(/\.$/, '').split(';').map(s => s.trim());
            return (
              <p key={i} className="text-[0.95rem] leading-relaxed text-fg-muted flex">
                <span className="text-fg-subtle/40 mr-2 select-none">&bull;</span>
                <span>
                  {segments.map((seg, si) => (
                    <span key={si}>
                      {si === 0 ? (
                        <span className="text-fg">{seg}</span>
                      ) : (
                        <span>{seg}</span>
                      )}
                      {si < segments.length - 1 && (
                        <span className="text-fg-subtle mx-1">&middot;</span>
                      )}
                    </span>
                  ))}
                </span>
              </p>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
