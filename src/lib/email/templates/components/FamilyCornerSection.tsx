import { Section, Text, Hr } from '@react-email/components';
import { FamilyCornerSection as FamilyCornerData } from '../../types';
import { getBandLabel } from '@/lib/childcare/age-bands';
import type { AgeBand } from '@/lib/childcare/age-bands';

interface FamilyCornerSectionProps {
  familyCorner: FamilyCornerData;
}

export function FamilyCornerSection({ familyCorner }: FamilyCornerSectionProps) {
  const bandSubtitle = familyCorner.ageBands
    .map(b => getBandLabel(b as AgeBand))
    .join(' + ');

  // Split body into paragraphs
  const paragraphs = familyCorner.bodyText
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean);

  return (
    <Section style={container}>
      {/* Divider */}
      <Section style={dividerBlock}>
        <Text style={sectionLabel}>FAMILY CORNER</Text>
        <Text style={bandLine}>{bandSubtitle}</Text>
        <Hr style={rule} />
      </Section>

      {/* Content */}
      <Section style={contentBlock}>
        <Text style={headline}>{familyCorner.headline}</Text>
        {paragraphs.map((p, i) => (
          <Text key={i} style={bodyText}>{p}</Text>
        ))}
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

const bandLine = {
  fontSize: '11px',
  fontWeight: '400' as const,
  letterSpacing: '0.08em',
  color: '#b0b0b0',
  margin: '2px 0 12px',
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

const bodyText = {
  fontSize: '15px',
  color: '#555555',
  lineHeight: '1.6',
  margin: '0 0 12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
