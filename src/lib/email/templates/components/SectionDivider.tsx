import { Section, Text, Hr } from '@react-email/components';

interface SectionDividerProps {
  name: string;
  city?: string;
}

export function SectionDivider({ name, city }: SectionDividerProps) {
  const showCity = city && city.toLowerCase() !== name.toLowerCase();

  return (
    <Section style={container}>
      <Text style={label}>
        {name}
        {showCity && <span style={cityText}> &middot; {city}</span>}
      </Text>
      <Hr style={rule} />
    </Section>
  );
}

const container = {
  padding: '40px 0 0',
  textAlign: 'center' as const,
};

const label = {
  fontSize: '13px',
  fontWeight: '400' as const,
  letterSpacing: '0.3em',
  textTransform: 'uppercase' as const,
  color: '#1a1a1a',
  margin: '0 0 12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const cityText = {
  color: '#b0b0b0',
  letterSpacing: '0.15em',
};

const rule = {
  borderTop: '1px solid #e5e5e5',
  margin: '0 auto',
  maxWidth: '60px',
};
