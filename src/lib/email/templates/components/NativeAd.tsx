import { Section, Text, Img, Link, Hr } from '@react-email/components';
import { EmailAd } from '../../types';

interface NativeAdProps {
  ad: EmailAd;
}

export function NativeAd({ ad }: NativeAdProps) {
  return (
    <Section style={container}>
      <Hr style={divider} />
      <Text style={sponsoredLabel}>Sponsored</Text>
      <Link href={ad.clickUrl}>
        <Img
          src={ad.imageUrl}
          alt={ad.headline}
          width="100%"
          style={image}
        />
      </Link>
      <Link href={ad.clickUrl} style={headlineLink}>
        <Text style={headline}>{ad.headline}</Text>
      </Link>
      <Text style={sponsor}>{ad.sponsorLabel}</Text>
      <Img src={ad.impressionUrl} width="1" height="1" alt="" />
      <Hr style={divider} />
    </Section>
  );
}

const container = {
  marginBottom: '4px',
};

const divider = {
  borderTop: '1px solid #eeeeee',
  margin: '0 0 12px',
};

const sponsoredLabel = {
  fontSize: '10px',
  fontWeight: '600' as const,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  color: '#bbbbbb',
  margin: '0 0 8px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const image = {
  width: '100%',
  borderRadius: '4px',
  marginBottom: '8px',
};

const headlineLink = {
  textDecoration: 'none',
};

const headline = {
  fontSize: '14px',
  fontWeight: '500' as const,
  color: '#333333',
  margin: '0 0 4px',
  lineHeight: '1.3',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const sponsor = {
  fontSize: '11px',
  color: '#999999',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
