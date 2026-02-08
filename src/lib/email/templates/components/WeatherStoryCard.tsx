import { Section, Text } from '@react-email/components';
import { WeatherStory } from '../../types';

interface WeatherStoryCardProps {
  story: WeatherStory;
}

export function WeatherStoryCard({ story }: WeatherStoryCardProps) {
  const isAlert = story.priority === 1;

  return (
    <Section style={isAlert ? containerAlert : container}>
      <Text style={tempLine}>
        {story.useFahrenheit
          ? `${story.temperatureF}°F / ${story.temperatureC}°C`
          : `${story.temperatureC}°C / ${story.temperatureF}°F`}
      </Text>
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
  backgroundColor: '#f0f4f8',
  borderRadius: '4px',
  padding: '16px',
  marginBottom: '20px',
  borderLeft: '3px solid #4a90d9',
};

const containerAlert = {
  backgroundColor: '#fef2f2',
  borderRadius: '4px',
  padding: '16px',
  marginBottom: '20px',
  borderLeft: '3px solid #dc2626',
};

const tempLine = {
  fontSize: '12px',
  fontWeight: '500' as const,
  color: '#666666',
  margin: '0 0 8px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const headline = {
  fontSize: '17px',
  fontWeight: '600' as const,
  color: '#1a1a1a',
  margin: '0 0 6px',
  lineHeight: '1.3',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const headlineAlert = {
  fontSize: '17px',
  fontWeight: '700' as const,
  color: '#991b1b',
  margin: '0 0 6px',
  lineHeight: '1.3',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const body = {
  fontSize: '15px',
  color: '#555555',
  lineHeight: '1.5',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
