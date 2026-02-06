import { Section, Text, Img, Link, Hr } from '@react-email/components';
import { EmailAd } from '../../types';

interface HeaderProps {
  date: string;
  headerAd: EmailAd | null;
}

export function Header({ date, headerAd }: HeaderProps) {
  return (
    <Section>
      <Text style={masthead}>FLANEUR</Text>
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
  fontSize: '32px',
  fontWeight: '300' as const,
  letterSpacing: '0.15em',
  textAlign: 'center' as const,
  margin: '24px 0 4px',
  color: '#000000',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const dateLine = {
  fontSize: '13px',
  color: '#666666',
  textAlign: 'center' as const,
  margin: '0 0 16px',
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const divider = {
  borderTop: '1px solid #e5e5e5',
  margin: '0 0 16px',
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
  borderRadius: '4px',
};
