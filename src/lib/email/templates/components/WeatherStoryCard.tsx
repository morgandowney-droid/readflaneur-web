import { Section, Text } from '@react-email/components';
import { WeatherStory } from '../../types';

interface WeatherStoryCardProps {
  story: WeatherStory;
}

export function WeatherStoryCard({ story }: WeatherStoryCardProps) {
  const isAlert = story.priority === 1;

  return (
    <Section style={isAlert ? containerAlert : container}>
      <Text style={isAlert ? headlineAlert : headline}>
        {story.headline}
      </Text>
      <Text style={body}>
        {story.body}
      </Text>
    </Section>
  );
}

const container = {
  padding: '16px 0',
  marginBottom: '16px',
  borderBottom: '1px solid #eeeeee',
};

const containerAlert = {
  padding: '16px 0 16px 16px',
  marginBottom: '16px',
  borderBottom: '1px solid #eeeeee',
  borderLeft: '3px solid #dc2626',
};

const headline = {
  fontSize: '17px',
  fontWeight: '600' as const,
  color: '#1a1a1a',
  margin: '0 0 6px',
  lineHeight: '1.3',
  fontFamily: "'Playfair Display', Georgia, serif",
};

const headlineAlert = {
  fontSize: '17px',
  fontWeight: '700' as const,
  color: '#991b1b',
  margin: '0 0 6px',
  lineHeight: '1.3',
  fontFamily: "'Playfair Display', Georgia, serif",
};

const body = {
  fontSize: '15px',
  color: '#555555',
  lineHeight: '1.6',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
