import { Section, Text } from '@react-email/components';
import { WeatherData } from '../../types';

interface WeatherWidgetProps {
  weather: WeatherData;
  neighborhoodName: string;
}

export function WeatherWidget({ weather }: WeatherWidgetProps) {
  return (
    <Section style={container}>
      <Text style={tempText}>
        {weather.useFahrenheit
          ? `${weather.temperatureF}°F / ${weather.temperatureC}°C`
          : `${weather.temperatureC}°C / ${weather.temperatureF}°F`}
        <span style={descText}> - {weather.description}</span>
        <span style={timeText}> &middot; as of {weather.asOfTime}</span>
      </Text>
    </Section>
  );
}

const container = {
  backgroundColor: '#f8f8f8',
  borderRadius: '4px',
  padding: '12px 16px',
  marginBottom: '20px',
};

const tempText = {
  fontSize: '16px',
  fontWeight: '500' as const,
  color: '#333333',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const descText = {
  fontWeight: '400' as const,
  color: '#666666',
};

const timeText = {
  fontWeight: '400' as const,
  color: '#999999',
  fontSize: '13px',
};
