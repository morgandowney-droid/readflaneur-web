import { Section, Text, Hr } from '@react-email/components';

interface SectionDividerProps {
  name: string;
  city?: string;
  primaryCity?: string;
  showRule?: boolean;
}

export function SectionDivider({ name, city, primaryCity, showRule = true }: SectionDividerProps) {
  const shouldShowCity = (() => {
    if (!city) return false;
    const n = name.toLowerCase();
    const c = city.toLowerCase();
    // Rule 1: Redundancy — neighborhood contains city name
    if (n.includes(c) || c === n) return false;
    // Rule 2: Familiarity — same as primary/home city
    if (primaryCity && c === primaryCity.toLowerCase()) return false;
    // Rule 3: Foreign — show city only when abroad
    return true;
  })();

  return (
    <Section style={container}>
      <Text style={label}>
        {name}
        {shouldShowCity && <span style={cityText}> &middot; {city}</span>}
      </Text>
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

const cityText = {
  color: '#b0b0b0',
  letterSpacing: '0.15em',
};

const rule = {
  borderTop: '1px solid rgba(120, 53, 15, 0.4)',
  margin: '0 auto',
  maxWidth: '32px',
};
