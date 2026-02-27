import { Section, Text, Img, Link, Hr } from '@react-email/components';
import type { PostcardSection as PostcardData } from '../../types';

interface PostcardSectionProps {
  postcard: PostcardData;
}

interface PostcardsSundaySectionProps {
  postcards: PostcardData[];
}

/**
 * Single postcard for Daily Brief emails.
 * Warm background with Unsplash photo, neighborhood name, and teaser.
 */
export function PostcardSection({ postcard }: PostcardSectionProps) {
  return (
    <Section style={container}>
      <Section style={dividerBlock}>
        <Text style={sectionLabel}>POSTCARD</Text>
        <Hr style={rule} />
      </Section>

      <Section style={cardContainer}>
        <Link href={postcard.articleUrl} style={imageLink}>
          <Img
            src={postcard.imageUrl}
            alt={`${postcard.neighborhoodName}, ${postcard.cityName}`}
            width="100%"
            style={heroImage}
          />
        </Link>

        <Text style={locationText}>
          {postcard.neighborhoodName.toUpperCase()}
          <span style={citySpan}> &middot; {postcard.cityName}</span>
        </Text>

        <Text style={teaserText}>{postcard.teaser}</Text>

        <Text style={exploreLink}>
          <Link href={postcard.articleUrl} style={exploreLinkAnchor}>
            Explore {postcard.neighborhoodName} &rsaquo;
          </Link>
        </Text>
      </Section>
    </Section>
  );
}

/**
 * Triple postcard section for Sunday Edition emails.
 * Replaces "Your Other Editions" with 3 discovery neighborhoods.
 */
export function PostcardsSundaySection({ postcards }: PostcardsSundaySectionProps) {
  return (
    <Section style={container}>
      <Section style={dividerBlock}>
        <Text style={sectionLabel}>POSTCARDS</Text>
        <Text style={subtitle}>Three neighborhoods worth knowing.</Text>
        <Hr style={rule} />
      </Section>

      {postcards.map((postcard, i) => (
        <Section key={i} style={i > 0 ? sundayCardWithDivider : sundayCard}>
          {i > 0 && <Hr style={cardDivider} />}

          <Link href={postcard.articleUrl} style={imageLink}>
            <Img
              src={postcard.imageUrl}
              alt={`${postcard.neighborhoodName}, ${postcard.cityName}`}
              width="100%"
              style={sundayImage}
            />
          </Link>

          <Text style={locationText}>
            {postcard.neighborhoodName.toUpperCase()}
            <span style={citySpan}> &middot; {postcard.cityName}</span>
          </Text>

          <Text style={sundayTeaserText}>{postcard.teaser}</Text>

          <Text style={exploreLink}>
            <Link href={postcard.articleUrl} style={exploreLinkAnchor}>
              Explore &rsaquo;
            </Link>
          </Text>
        </Section>
      ))}
    </Section>
  );
}

// ─── Styles ───

const container = {
  marginBottom: '8px',
};

const dividerBlock = {
  padding: '40px 0 0',
  textAlign: 'center' as const,
};

const sectionLabel = {
  fontSize: '10px',
  fontWeight: '400' as const,
  letterSpacing: '0.25em',
  textTransform: 'uppercase' as const,
  color: '#C9A96E',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const subtitle = {
  fontSize: '13px',
  fontWeight: '400' as const,
  color: '#999999',
  margin: '4px 0 0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontStyle: 'italic' as const,
};

const rule = {
  borderTop: '1px solid rgba(120, 53, 15, 0.4)',
  margin: '12px auto 0',
  maxWidth: '32px',
};

const cardContainer = {
  backgroundColor: '#FDFBF7',
  borderTop: '2px solid #e8e0d4',
  padding: '20px',
  marginTop: '16px',
  borderRadius: '4px',
};

const imageLink = {
  display: 'block' as const,
  textDecoration: 'none',
};

const heroImage = {
  borderRadius: '12px',
  maxHeight: '180px',
  width: '100%' as const,
  objectFit: 'cover' as const,
};

const sundayCard = {
  backgroundColor: '#FDFBF7',
  padding: '16px 20px',
  marginTop: '16px',
  borderRadius: '4px',
};

const sundayCardWithDivider = {
  ...sundayCard,
  marginTop: '0',
};

const sundayImage = {
  borderRadius: '12px',
  maxHeight: '140px',
  width: '100%' as const,
  objectFit: 'cover' as const,
};

const cardDivider = {
  borderTop: '1px solid #e8e0d4',
  margin: '0 0 16px',
};

const locationText = {
  fontSize: '11px',
  fontWeight: '400' as const,
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  color: '#1a1a1a',
  margin: '12px 0 0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const citySpan = {
  color: '#b0b0b0',
  letterSpacing: '0.15em',
};

const teaserText = {
  fontSize: '15px',
  color: '#555555',
  lineHeight: '1.6',
  margin: '8px 0 12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const sundayTeaserText = {
  fontSize: '14px',
  color: '#555555',
  lineHeight: '1.5',
  margin: '6px 0 8px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const exploreLink = {
  margin: '0',
};

const exploreLinkAnchor = {
  fontSize: '13px',
  fontWeight: '500' as const,
  color: '#C9A96E',
  textDecoration: 'none',
  fontFamily: "'Playfair Display', Georgia, serif",
};
