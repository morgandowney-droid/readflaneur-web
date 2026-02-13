'use client';

import { ReactNode } from 'react';

interface ArticleBodyProps {
  content: string;
  neighborhoodName: string;
  city: string;
}

export function ArticleBody({ content, neighborhoodName, city }: ArticleBodyProps) {
  // First, convert any HTML <a> tags to markdown format for consistent handling
  // <a href="url" ...>text</a> -> [text](url)
  let cleanedContent = content
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '[$2]($1)')
    // Strip any other HTML tags that may have been generated
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|span|strong|em|b|i)[^>]*>/gi, '')
    // Preserve markdown links by converting them to a placeholder format
    // [text](url) -> {{LINK:url}}text{{/LINK}}
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '{{LINK:$2}}$1{{/LINK}}')
    // Clean content: remove citation markers and bare URLs (not in markdown format)
    .replace(/\[\[\d+\]\]/g, '')
    .replace(/(?<!\{\{LINK:)https?:\/\/\S+/g, '')
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
  const linkClass = 'text-current font-semibold underline decoration-dotted decoration-neutral-500/40 decoration-1 underline-offset-4 hover:decoration-neutral-300/60 hover:decoration-solid transition-all';

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

        // Process bold markers and links
        // First, extract links and replace with numbered placeholders
        const links: { url: string; text: string }[] = [];
        let processedParagraph = paragraph.replace(/\{\{LINK:(https?:\/\/[^}]+)\}\}([^{]+)\{\{\/LINK\}\}/g,
          (_, url, text) => {
            links.push({ url, text: text.replace(/\*\*/g, '') }); // Remove ** from link text
            return `{{LINKREF:${links.length - 1}}}`;
          }
        );

        // Process bold markers
        processedParagraph = processedParagraph.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Render function that handles strong tags and link refs
        const renderParts = (text: string): ReactNode[] => {
          const result: ReactNode[] = [];
          // Split by both strong tags and link references
          const parts = text.split(/(<strong>[^<]+<\/strong>|\{\{LINKREF:\d+\}\})/);

          parts.forEach((part, partIdx) => {
            const strongMatch = part.match(/<strong>([^<]+)<\/strong>/);
            const linkMatch = part.match(/\{\{LINKREF:(\d+)\}\}/);

            if (strongMatch) {
              result.push(<strong key={`strong-${partIdx}`} className="font-bold text-fg">{strongMatch[1]}</strong>);
            } else if (linkMatch) {
              const linkIdx = parseInt(linkMatch[1]);
              const link = links[linkIdx];
              if (link) {
                result.push(
                  <a
                    key={`link-${partIdx}`}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    {link.text}
                  </a>
                );
              }
            } else if (part) {
              result.push(part);
            }
          });

          return result;
        };

        // Helper to render content with line breaks preserved
        const renderWithLineBreaks = (content: string, renderer: (text: string) => ReactNode[]): ReactNode[] => {
          // Split on newlines (handle both \n and markdown line breaks with trailing spaces)
          const lines = content.split(/  \n|\n/);
          const result: ReactNode[] = [];
          lines.forEach((line, lineIdx) => {
            if (lineIdx > 0) {
              result.push(<br key={`br-${lineIdx}`} />);
            }
            result.push(...renderer(line));
          });
          return result;
        };

        // If there are links or bold text, use the custom renderer
        if (links.length > 0 || processedParagraph.includes('<strong>')) {
          return (
            <p key={index} className={pClass}>
              {renderWithLineBreaks(processedParagraph, renderParts)}
            </p>
          );
        }

        // Regular paragraph - plain text
        return (
          <p key={index} className={pClass}>
            {renderWithLineBreaks(paragraph, (text) => [text])}
          </p>
        );
      })}
    </article>
  );
}
