import { Section, Text, Link } from '@react-email/components';
import { SatelliteNeighborhoodSection as SatelliteSectionData } from '../../types';
import { SectionDivider } from './SectionDivider';

interface SatelliteSectionProps {
  section: SatelliteSectionData;
}

export function SatelliteSection({ section }: SatelliteSectionProps) {
  return (
    <Section style={container}>
      <SectionDivider name={section.neighborhoodName} city={section.cityName} />
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
