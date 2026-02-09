import { Section, Text, Link, Hr } from '@react-email/components';
import { SatelliteNeighborhoodSection as SatelliteSectionData } from '../../types';

interface SatelliteSectionProps {
  section: SatelliteSectionData;
}

export function SatelliteSection({ section }: SatelliteSectionProps) {
  // Don't show redundant city name (e.g., "Nantucket · Nantucket")
  const showCity = section.cityName.toLowerCase() !== section.neighborhoodName.toLowerCase();

  return (
    <Section style={container}>
      <Hr style={divider} />
      <Text style={sectionTitle}>
        {section.neighborhoodName}
        {showCity && (
          <span style={cityLabel}> &middot; {section.cityName}</span>
        )}
      </Text>
      {section.stories.map((story, i) => (
        <Section key={i} style={storyRow}>
          <Link href={story.articleUrl} style={headlineLink}>
            {story.categoryLabel && (
              <Text style={categoryLine}>{story.categoryLabel}</Text>
            )}
            <Text style={headline}>
              {story.headline}
            </Text>
          </Link>
        </Section>
      ))}
    </Section>
  );
}

const container = {
  marginBottom: '8px',
};

const divider = {
  borderTop: '1px solid #e5e5e5',
  marginTop: '32px',
  marginBottom: '20px',
};

const sectionTitle = {
  fontSize: '18px',
  fontWeight: '700' as const,
  letterSpacing: '0.03em',
  textTransform: 'uppercase' as const,
  color: '#000000',
  margin: '0 0 12px',
  fontFamily: "'Playfair Display', Georgia, serif",
};

const cityLabel = {
  fontWeight: '400' as const,
  color: '#b0b0b0',
  textTransform: 'none' as const,
  letterSpacing: '0',
  fontSize: '14px',
};

const storyRow = {
  marginBottom: '16px',
};

const headlineLink = {
  textDecoration: 'none',
};

const headline = {
  fontSize: '16px',
  fontWeight: '500' as const,
  color: '#333333',
  margin: '0 0 2px',
  lineHeight: '1.4',
  fontFamily: "'Playfair Display', Georgia, serif",
};

const categoryLine = {
  fontSize: '11px',
  fontWeight: '600' as const,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: '#b0b0b0',
  margin: '0 0 2px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
