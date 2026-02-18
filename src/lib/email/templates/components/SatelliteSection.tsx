import { Section, Text, Link } from '@react-email/components';
import { SatelliteNeighborhoodSection as SatelliteSectionData } from '../../types';
import { SectionDivider } from './SectionDivider';

function truncateAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastPeriod = slice.lastIndexOf('.');
  const lastExcl = slice.lastIndexOf('!');
  const lastQuestion = slice.lastIndexOf('?');
  const lastEnd = Math.max(lastPeriod, lastExcl, lastQuestion);
  if (lastEnd > 0) return text.slice(0, lastEnd + 1);
  const lastSpace = slice.lastIndexOf(' ');
  return lastSpace > 0 ? text.slice(0, lastSpace) : slice;
}

interface SatelliteSectionProps {
  section: SatelliteSectionData;
}

export function SatelliteSection({ section }: SatelliteSectionProps) {
  return (
    <Section style={container}>
      <SectionDivider
        name={section.neighborhoodName}
        city={section.cityName}
      />
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
          {story.previewText && (
            <Text style={preview}>
              {truncateAtSentence(story.previewText, 280)}
            </Text>
          )}
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

const preview = {
  fontSize: '15px',
  color: '#555555',
  lineHeight: '1.6',
  margin: '4px 0 0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  overflow: 'hidden' as const,
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical' as const,
};
