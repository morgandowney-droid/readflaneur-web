import { Section, Text, Link } from '@react-email/components';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Renders the full enriched brief body in the email — greeting, [[section headers]],
 * prose paragraphs, markdown links, and bold emphasis — so the partner email shows
 * the same complete content the website shows, not a single-story summary.
 *
 * Input format (from neighborhood_briefs.enriched_content):
 *   Good morning, {neighborhood}.
 *
 *   [[Section header in bold caps]]
 *
 *   Prose paragraph with [inline link text](https://example.com) and **bold** words.
 *
 *   [[Another section]]
 *
 *   More prose...
 *
 *   Closing sentence (often in the local language).
 */

interface Props {
  body: string;
  sources?: Array<{ name: string; url?: string }>;
  articleUrl?: string | null;
  neighborhoodName: string;
}

const HEADER_RE = /\[\[([^\]]+)\]\]/;
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const BOLD_RE = /\*\*([^*]+)\*\*/g;

// Strip prompt-label artifacts that Gemini sometimes leaks as prose
function cleanParagraph(text: string): string {
  return text
    .replace(/^(TEASER|SUBJECT|LINK_CANDIDATES|EMAIL_TEASER|HEADLINE|SUBJECT_TEASER)\s*:.*$/gim, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Render inline markdown ([text](url), **bold**) inside a paragraph.
 * Returns an array of React nodes suitable for <Text> children.
 */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  // Process links first, then bold within link-free chunks
  const matches: Array<{ start: number; end: number; type: 'link' | 'bold'; text: string; url?: string }> = [];

  let m: RegExpExecArray | null;
  const linkRe = new RegExp(MARKDOWN_LINK_RE.source, 'g');
  while ((m = linkRe.exec(text)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, type: 'link', text: m[1], url: m[2] });
  }

  const boldRe = new RegExp(BOLD_RE.source, 'g');
  while ((m = boldRe.exec(text)) !== null) {
    // Skip bolds that overlap with a link range
    const overlaps = matches.some(
      (x) => x.type === 'link' && m!.index >= x.start && m!.index + m![0].length <= x.end
    );
    if (!overlaps) {
      matches.push({ start: m.index, end: m.index + m[0].length, type: 'bold', text: m[1] });
    }
  }

  matches.sort((a, b) => a.start - b.start);

  for (const match of matches) {
    if (match.start > cursor) {
      nodes.push(text.slice(cursor, match.start));
    }
    if (match.type === 'link' && match.url) {
      nodes.push(
        <Link key={`lnk-${key++}`} href={match.url} style={linkStyle}>
          {match.text}
        </Link>
      );
    } else {
      nodes.push(
        <strong key={`bold-${key++}`} style={boldStyle}>
          {match.text}
        </strong>
      );
    }
    cursor = match.end;
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes.length > 0 ? nodes : [text];
}

export function EnrichedBriefBody({ body, sources, articleUrl, neighborhoodName }: Props) {
  if (!body) return null;

  // Split on blank lines into blocks, keeping section headers as standalone blocks
  const blocks = body
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const rendered: ReactNode[] = [];
  blocks.forEach((raw, idx) => {
    const headerMatch = raw.match(HEADER_RE);
    if (headerMatch && raw.replace(HEADER_RE, '').trim().length === 0) {
      rendered.push(
        <Text key={`h-${idx}`} style={sectionHeader}>
          {headerMatch[1].toUpperCase()}
        </Text>
      );
      return;
    }
    // Header inline at start followed by prose on the next line — split them
    if (headerMatch && raw.startsWith(headerMatch[0])) {
      const rest = raw.slice(headerMatch[0].length).trim();
      rendered.push(
        <Text key={`h-${idx}`} style={sectionHeader}>
          {headerMatch[1].toUpperCase()}
        </Text>
      );
      if (rest) {
        rendered.push(
          <Text key={`p-${idx}`} style={paragraph}>
            {renderInline(cleanParagraph(rest))}
          </Text>
        );
      }
      return;
    }
    const cleaned = cleanParagraph(raw);
    if (!cleaned) return;
    rendered.push(
      <Text key={`p-${idx}`} style={paragraph}>
        {renderInline(cleaned)}
      </Text>
    );
  });

  return (
    <Section style={wrapper}>
      {rendered}

      {sources && sources.length > 0 && (
        <Text style={sourceLine}>
          <em>Synthesized from reporting by {sources.map((s, i) => (
            <span key={i}>
              {i > 0 && (i === sources.length - 1 ? ' and ' : ', ')}
              {s.url ? <Link href={s.url} style={sourceLink}>{s.name}</Link> : <span>{s.name}</span>}
            </span>
          ))}.</em>
        </Text>
      )}

      {articleUrl && (
        <Text style={continueLine}>
          <Link href={articleUrl} style={continueLink}>
            Read the full {neighborhoodName} Daily Brief on the web &rsaquo;
          </Link>
        </Text>
      )}
    </Section>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const wrapper: CSSProperties = {
  padding: '24px 0 8px',
};

const sectionHeader: CSSProperties = {
  fontFamily: "'Playfair Display', Georgia, serif",
  fontSize: '14px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#1c1917',
  margin: '24px 0 8px',
  lineHeight: '1.4',
};

const paragraph: CSSProperties = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: '16px',
  lineHeight: '1.7',
  color: '#1c1917',
  margin: '0 0 16px',
};

const linkStyle: CSSProperties = {
  color: '#1c1917',
  textDecoration: 'underline',
  textDecorationColor: 'rgba(120, 53, 15, 0.5)',
  textUnderlineOffset: '3px',
};

const boldStyle: CSSProperties = {
  fontWeight: 700,
  color: '#1c1917',
};

const sourceLine: CSSProperties = {
  fontFamily: 'Georgia, serif',
  fontSize: '13px',
  color: '#78716c',
  margin: '24px 0 12px',
  borderTop: '1px solid #e7e5e4',
  paddingTop: '16px',
};

const sourceLink: CSSProperties = {
  color: '#78716c',
  textDecoration: 'underline',
  textDecorationColor: 'rgba(120, 53, 15, 0.4)',
};

const continueLine: CSSProperties = {
  fontSize: '14px',
  margin: '8px 0 0',
};

const continueLink: CSSProperties = {
  color: '#b45309',
  textDecoration: 'underline',
  textDecorationColor: 'rgba(180, 83, 9, 0.4)',
};
