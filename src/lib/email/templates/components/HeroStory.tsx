import { Section, Text, Img, Link } from '@react-email/components';
import { EmailStory } from '../../types';

interface HeroStoryProps {
  story: EmailStory;
}

export function HeroStory({ story }: HeroStoryProps) {
  return (
    <Section style={container}>
      {story.imageUrl && (
        <Link href={story.articleUrl}>
          <Img
            src={story.imageUrl}
            alt={story.headline}
            width="100%"
            style={image}
          />
        </Link>
      )}
      {story.categoryLabel && (
        <Text style={category}>
          {story.categoryLabel}
          <span style={locationTag}> &middot; {story.location}</span>
        </Text>
      )}
      {!story.categoryLabel && (
        <Text style={category}>
          <span style={locationTag}>{story.location}</span>
        </Text>
      )}
      <Link href={story.articleUrl} style={headlineLink}>
        <Text style={headline}>{story.headline}</Text>
      </Link>
      {story.previewText && (
        <Text style={preview}>{story.previewText}</Text>
      )}
    </Section>
  );
}

const container = {
  marginBottom: '24px',
};

const image = {
  width: '100%',
  borderRadius: '4px',
  marginBottom: '12px',
};

const category = {
  fontSize: '11px',
  fontWeight: '600' as const,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  color: '#999999',
  margin: '0 0 4px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const headlineLink = {
  textDecoration: 'none',
};

const headline = {
  fontSize: '20px',
  fontWeight: '600' as const,
  color: '#000000',
  margin: '0 0 8px',
  lineHeight: '1.3',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const preview = {
  fontSize: '14px',
  color: '#555555',
  lineHeight: '1.5',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const locationTag = {
  fontWeight: '400' as const,
  color: '#bbbbbb',
  letterSpacing: '0.05em',
};
