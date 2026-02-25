import { Section, Text, Hr } from '@react-email/components';
import { FamilyCornerSection as FamilyCornerData } from '../../types';
import { getBandLabel } from '@/lib/childcare/age-bands';
import type { AgeBand } from '@/lib/childcare/age-bands';

interface FamilyCornerSectionProps {
  familyCorner: FamilyCornerData;
}

interface BodySection {
  bandHeader: string | null;
  text: string;
}

/**
 * Parse body text into sections, splitting on **BandLabel:** markers.
 * Handles both \n\n-separated paragraphs and inline **bold:** headers.
 */
function parseBodySections(bodyText: string): BodySection[] {
  // Split on **BandLabel:** patterns (e.g., "**Infant (0-18mo):**")
  // This regex captures the bold header and the text after it
  const parts = bodyText.split(/\*\*([^*]+)\*\*/);

  // parts alternates: [textBefore, header1, textAfter1, header2, textAfter2, ...]
  const sections: BodySection[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

    if (i % 2 === 0) {
      // Regular text (no bold header) - split by double newlines
      const paragraphs = part.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
      for (const p of paragraphs) {
        sections.push({ bandHeader: null, text: p });
      }
    } else {
      // This is a bold header - combine with the text that follows
      const nextText = (i + 1 < parts.length) ? parts[i + 1].trim() : '';
      i++; // skip the next part since we consumed it
      sections.push({ bandHeader: part, text: nextText });
    }
  }

  // Fallback: if parsing produced nothing, just split on newlines
  if (sections.length === 0) {
    return bodyText.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
      .map(text => ({ bandHeader: null, text }));
  }

  return sections;
}

export function FamilyCornerSection({ familyCorner }: FamilyCornerSectionProps) {
  const bandSubtitle = familyCorner.ageBands
    .map(b => getBandLabel(b as AgeBand))
    .join(' + ');

  const sections = parseBodySections(familyCorner.bodyText);
  const displayName = familyCorner.neighborhoodName.toUpperCase();

  return (
    <Section style={container} id="family-corner">
      {/* Divider */}
      <Section style={dividerBlock}>
        <Text style={sectionLabel}>
          FAMILY CORNER <span style={neighborhoodSpan}>&middot; {displayName}</span>
        </Text>
        <Text style={bandLine}>{bandSubtitle}</Text>
        <Text style={primaryNote}>For your primary neighborhood: {familyCorner.neighborhoodName}</Text>
        <Hr style={rule} />
      </Section>

      {/* Content */}
      <Section style={contentBlock}>
        <Text style={headline}>{familyCorner.headline}</Text>
        {sections.map((section, i) => {
          // Detect if this is the start of a new age band (e.g., "Toddler" after "Infant" sections)
          // by checking if the band label prefix changed from the previous section
          const currentBand = section.bandHeader?.match(/^(\w[\w\s]*?)\s*\(/)?.[1]?.trim();
          const prevBand = i > 0 && sections[i - 1].bandHeader
            ? sections[i - 1].bandHeader?.match(/^(\w[\w\s]*?)\s*\(/)?.[1]?.trim()
            : null;
          const showDivider = i > 0 && currentBand && prevBand && currentBand !== prevBand;

          return (
            <span key={i}>
              {showDivider && <Hr style={ageBandDivider} />}
              <Text style={bodyText}>
                {section.bandHeader && (
                  <span style={bandHeaderStyle}>{section.bandHeader} </span>
                )}
                {section.text}
              </Text>
            </span>
          );
        })}
      </Section>
    </Section>
  );
}

const container = {
  marginBottom: '8px',
};

const dividerBlock = {
  padding: '40px 0 0',
  textAlign: 'center' as const,
};

const sectionLabel = {
  fontSize: '13px',
  fontWeight: '400' as const,
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  color: '#1a1a1a',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const neighborhoodSpan = {
  color: '#b0b0b0',
  letterSpacing: '0.15em',
};

const bandLine = {
  fontSize: '11px',
  fontWeight: '400' as const,
  letterSpacing: '0.08em',
  color: '#b0b0b0',
  margin: '2px 0 0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const primaryNote = {
  fontSize: '10px',
  fontWeight: '400' as const,
  color: '#cccccc',
  margin: '4px 0 12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const rule = {
  borderTop: '1px solid rgba(120, 53, 15, 0.4)',
  margin: '0 auto',
  maxWidth: '32px',
};

const contentBlock = {
  padding: '16px 0 0',
};

const headline = {
  fontSize: '16px',
  fontWeight: '500' as const,
  color: '#333333',
  margin: '0 0 8px',
  lineHeight: '1.4',
  fontFamily: "'Playfair Display', Georgia, serif",
};

const bandHeaderStyle = {
  fontWeight: '600' as const,
  color: '#333333',
};

const ageBandDivider = {
  borderTop: '1px solid #e5e5e5',
  margin: '8px 0 12px',
};

const bodyText = {
  fontSize: '15px',
  color: '#555555',
  lineHeight: '1.6',
  margin: '0 0 12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
