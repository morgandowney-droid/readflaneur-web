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

  // Insert paragraph breaks before section headers [[...]]
  // This ensures headers get their own line/block
  cleanedContent = cleanedContent.replace(/\s*(\[\[[^\]]+\]\])\s*/g, '\n\n$1\n\n');

  // Also insert paragraph breaks after sentences that end with ]] (header followed by content)
  cleanedContent = cleanedContent.replace(/\]\]\s+([A-Z])/g, ']]\n\n$1');

  // Split into paragraphs - handle both \n\n and single \n
  let paragraphs = cleanedContent
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // If still only one paragraph and it's long, try to split on sentence boundaries
  if (paragraphs.length === 1 && paragraphs[0].length > 500) {
    const longParagraph = paragraphs[0];
    // Split on sentence endings followed by space and capital letter, creating ~3-4 sentence paragraphs
    const sentences = longParagraph.split(/(?<=[.!?])\s+(?=[A-Z])/);
    const newParagraphs: string[] = [];
    let currentPara = '';

    for (const sentence of sentences) {
      if (currentPara.length + sentence.length > 400 && currentPara.length > 0) {
        newParagraphs.push(currentPara.trim());
        currentPara = sentence;
      } else {
        currentPara += (currentPara ? ' ' : '') + sentence;
      }
    }
    if (currentPara.trim()) {
      newParagraphs.push(currentPara.trim());
    }
    paragraphs = newParagraphs;
  }

  const pClass = 'text-fg text-[1.2rem] md:text-[1.35rem] leading-loose mb-8';

  return (
    <article className="max-w-none" style={{ fontFamily: 'var(--font-body-serif)' }}>
      {paragraphs.map((paragraph, index) => {
        // Horizontal rule separator (--- between event listing and prose)
        if (paragraph.trim() === '---') {
          return <hr key={index} className="border-border my-8" />;
        }

        // Check if this is a section header (wrapped in [[ ]])
        const headerMatch = paragraph.match(/^\[\[([^\]]+)\]\]$/);
        if (headerMatch) {
          return (
            <h3 key={index} className="text-xl font-semibold text-fg mt-10 mb-6" style={{ fontFamily: 'var(--font-body-serif)' }}>
              {headerMatch[1]}
            </h3>
          );
        }

        // Structured event line (2+ semicolons)
        if (isEventLine(paragraph)) {
          const segments = paragraph.replace(/\.$/, '').split(';').map(s => s.trim());
          return (
            <p key={index} className="text-[1rem] md:text-[1.1rem] leading-relaxed mb-2 text-fg-muted" style={{ fontFamily: 'var(--font-body-serif)' }}>
              {segments.map((seg, si) => (
                <span key={si}>
                  {si === 0 && seg.match(/\d{1,2}:\d{2}/) ? (
                    <span className="font-mono text-accent text-[0.9rem]">{seg}</span>
                  ) : (
                    <span>{seg}</span>
                  )}
                  {si < segments.length - 1 && (
                    <span className="text-fg-subtle mx-1">&middot;</span>
                  )}
                </span>
              ))}
            </p>
          );
        }

        // Process bold markers
        const processedParagraph = paragraph.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

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
