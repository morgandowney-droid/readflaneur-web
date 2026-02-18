import { Section, Text, Hr } from '@react-email/components';

interface SectionDividerProps {
  name: string;
  city?: string;
  showRule?: boolean;
}

export function SectionDivider({ name, city, showRule = true }: SectionDividerProps) {
  // Put city on separate line when combined text is long (avoids ugly word-wrap)
  const combined = city ? `${name} · ${city}` : name;
  const stackCity = combined.length > 25;

  return (
    <Section style={container}>
      {stackCity && city ? (
        <>
          <Text style={labelStacked}>{name}</Text>
          <Text style={cityLine}>{city}</Text>
        </>
      ) : (
        <Text style={label}>
          {name}
          {city && <span style={cityText}> &middot; {city}</span>}
        </Text>
      )}
      {showRule && <Hr style={rule} />}
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
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  color: '#1a1a1a',
  margin: '0 0 12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const labelStacked = {
  fontSize: '13px',
  fontWeight: '400' as const,
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  color: '#1a1a1a',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const cityLine = {
  fontSize: '13px',
  fontWeight: '400' as const,
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  color: '#b0b0b0',
  margin: '2px 0 12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const cityText = {
  color: '#b0b0b0',
  letterSpacing: '0.15em',
};

const rule = {
  borderTop: '1px solid rgba(120, 53, 15, 0.4)',
  margin: '0 auto',
  maxWidth: '32px',
};
