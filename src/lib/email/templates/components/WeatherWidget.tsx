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
          ? `${weather.temperatureF}°F`
          : `${weather.temperatureC}°C`}
        <span style={descText}> - {weather.description}</span>
        <span style={timeText}> &middot; as of {weather.asOfTime}</span>
      </Text>
    </Section>
  );
}

const container = {
  padding: '20px 0',
  textAlign: 'center' as const,
  marginBottom: '16px',
};

const tempText = {
  fontSize: '18px',
  fontWeight: '300' as const,
  color: '#333333',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const descText = {
  fontWeight: '400' as const,
  color: '#aaaaaa',
  fontSize: '13px',
};

const timeText = {
  fontWeight: '400' as const,
  color: '#cccccc',
  fontSize: '11px',
};
