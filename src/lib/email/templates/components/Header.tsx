import { Section, Text, Img, Link, Hr } from '@react-email/components';
import { EmailAd } from '../../types';

interface HeaderProps {
  date: string;
  headerAd: EmailAd | null;
  homeUrl?: string;
}

export function Header({ date, headerAd, homeUrl }: HeaderProps) {
  const href = homeUrl || 'https://readflaneur.com';
  return (
    <Section>
      <Text style={masthead}><Link href={href} style={mastheadLink}>FLANEUR</Link></Text>
      <Text style={dateLine}>{date}</Text>
      <Hr style={divider} />
      {headerAd && (
        <Section style={adBanner}>
          <Text style={presentedBy}>
            Presented by{' '}
            <Link href={headerAd.clickUrl} style={adLink}>
              {headerAd.sponsorLabel}
            </Link>
          </Text>
          <Link href={headerAd.clickUrl}>
            <Img
              src={headerAd.imageUrl}
              alt={headerAd.headline}
              width="100%"
              style={adImage}
            />
          </Link>
          <Img src={headerAd.impressionUrl} width="1" height="1" alt="" />
        </Section>
      )}
    </Section>
  );
}

const masthead = {
  fontSize: '28px',
  fontWeight: '400' as const,
  letterSpacing: '0.25em',
  textAlign: 'center' as const,
  padding: '32px 0 8px',
  margin: '0',
  color: '#000000',
  fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
};

const mastheadLink = {
  color: '#000000',
  textDecoration: 'none' as const,
};

const dateLine = {
  fontSize: '12px',
  color: '#b0b0b0',
  textAlign: 'center' as const,
  margin: '0 0 16px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const divider = {
  borderTop: '1px solid #eeeeee',
  marginTop: '16px',
  marginBottom: '16px',
};

const adBanner = {
  textAlign: 'center' as const,
  marginBottom: '24px',
};

const presentedBy = {
  fontSize: '11px',
  color: '#999999',
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  margin: '0 0 8px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const adLink = {
  color: '#999999',
  textDecoration: 'underline',
};

const adImage = {
  maxWidth: '100%',
  borderRadius: '12px',
};
