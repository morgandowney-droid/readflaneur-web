'use client';

import { ReactNode } from 'react';

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
    // Strip HTML <a> tags, keeping just the text
    .replace(/<a\s+[^>]*>([^<]+)<\/a>/gi, '$1')
    // Strip any other HTML tags that may have been generated
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|span|strong|em|b|i)[^>]*>/gi, '')
    // Strip markdown links, keeping just the text: [text](url) -> text
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
    // Clean content: remove citation markers and bare URLs
    .replace(/\[\[\d+\]\]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    // Strip URL-encoded artifacts from broken markdown link parsing
    .replace(/%20[A-Za-z%0-9]+(?:%20[A-Za-z%0-9]+)*\)/g, '')
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

        // Render function that handles strong tags
        const renderParts = (text: string): ReactNode[] => {
          const result: ReactNode[] = [];
          const parts = text.split(/(<strong>[^<]+<\/strong>)/);

          parts.forEach((part, partIdx) => {
            const strongMatch = part.match(/<strong>([^<]+)<\/strong>/);
            if (strongMatch) {
              result.push(<strong key={`strong-${partIdx}`} className="font-bold text-fg">{strongMatch[1]}</strong>);
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
