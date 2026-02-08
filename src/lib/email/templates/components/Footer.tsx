import { Section, Text, Link, Hr } from '@react-email/components';

interface FooterProps {
  unsubscribeUrl: string;
  preferencesUrl: string;
}

export function Footer({ unsubscribeUrl, preferencesUrl }: FooterProps) {
  return (
    <Section style={container}>
      <Hr style={divider} />
      <Text style={footerText}>
        You are receiving this because you subscribed to{' '}
        <Link href="https://readflaneur.com" style={link}>Flaneur</Link>.
      </Text>
      <Text style={footerText}>
        <Link href={preferencesUrl} style={link}>Manage preferences</Link>
        {' '}&middot;{' '}
        <Link href={unsubscribeUrl} style={link}>Unsubscribe</Link>
      </Text>
      <Text style={copyright}>
        &copy; Flaneur {new Date().getFullYear()}
      </Text>
    </Section>
  );
}

const container = {
  marginTop: '24px',
  paddingBottom: '24px',
};

const divider = {
  borderTop: '1px solid #e5e5e5',
  margin: '0 0 16px',
};

const footerText = {
  fontSize: '13px',
  color: '#999999',
  textAlign: 'center' as const,
  margin: '0 0 8px',
  lineHeight: '1.5',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const link = {
  color: '#666666',
  textDecoration: 'underline',
};

const copyright = {
  fontSize: '12px',
  color: '#cccccc',
  textAlign: 'center' as const,
  margin: '16px 0 0',
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
