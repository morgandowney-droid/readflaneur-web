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
      {ad.imageUrl && (
        <Link href={ad.clickUrl}>
          <Img
            src={ad.imageUrl}
            alt={ad.headline}
            width="100%"
            style={image}
          />
        </Link>
      )}
      <Link href={ad.clickUrl} style={headlineLink}>
        <Text style={headline}>{ad.headline}</Text>
      </Link>
      {ad.body && (
        <Text style={body}>{ad.body}</Text>
      )}
      <Text style={sponsor}>{ad.sponsorLabel}</Text>
      {ad.impressionUrl && (
        <Img src={ad.impressionUrl} width="1" height="1" alt="" />
      )}
      <Hr style={divider} />
    </Section>
  );
}

const container = {
  marginBottom: '4px',
};

const divider = {
  borderTop: '1px solid #eeeeee',
  margin: '0 0 20px',
};

const sponsoredLabel = {
  fontSize: '10px',
  fontWeight: '600' as const,
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  color: '#bbbbbb',
  margin: '0 0 8px',
  textAlign: 'center' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const image = {
  width: '100%',
  borderRadius: '4px',
  marginBottom: '12px',
};

const headlineLink = {
  textDecoration: 'none',
};

const headline = {
  fontSize: '18px',
  fontWeight: '600' as const,
  color: '#1a1a1a',
  margin: '0 0 6px',
  lineHeight: '1.3',
  textAlign: 'center' as const,
  fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
};

const body = {
  fontSize: '15px',
  color: '#555555',
  lineHeight: '1.6',
  margin: '0 0 8px',
  textAlign: 'center' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const sponsor = {
  fontSize: '11px',
  color: '#999999',
  margin: '0 0 8px',
  textAlign: 'center' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
