import { Section, Text, Link, Hr } from '@react-email/components';
import { EmailStory } from '../../types';

interface StoryListProps {
  stories: EmailStory[];
  variant?: 'primary' | 'default';
}

export function StoryList({ stories, variant = 'default' }: StoryListProps) {
  if (stories.length === 0) return null;

  const isPrimary = variant === 'primary';

  return (
    <Section>
      {stories.map((story, i) => (
        <Section key={i} style={storyRow}>
          <Hr style={divider} />
          <Text style={category}>
            {story.categoryLabel || ''}
            {story.categoryLabel && story.location && <span style={locationTag}> &middot; </span>}
            {story.location && <span style={locationTag}>{story.location}</span>}
          </Text>
          <Link href={story.articleUrl} style={headlineLink}>
            <Text style={isPrimary ? headlinePrimary : headline}>{story.headline}</Text>
          </Link>
          {story.previewText && (
            <Text style={isPrimary ? previewPrimary : preview}>
              {story.previewText.length > 120
                ? story.previewText.slice(0, 120) + '...'
                : story.previewText}
            </Text>
          )}
        </Section>
      ))}
    </Section>
  );
}

const storyRow = {
  marginBottom: '8px',
};

const divider = {
  borderTop: '1px solid #eeeeee',
  margin: '0 0 20px',
};

const category = {
  fontSize: '10px',
  fontWeight: '600' as const,
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  color: '#b0b0b0',
  margin: '0 0 2px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const headlineLink = {
  textDecoration: 'none',
};

const headline = {
  fontSize: '17px',
  fontWeight: '600' as const,
  color: '#1a1a1a',
  margin: '0 0 4px',
  lineHeight: '1.3',
  fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
};

const headlinePrimary = {
  fontSize: '19px',
  fontWeight: '600' as const,
  color: '#1a1a1a',
  margin: '0 0 4px',
  lineHeight: '1.3',
  fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
};

const preview = {
  fontSize: '15px',
  color: '#555555',
  lineHeight: '1.6',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const previewPrimary = {
  fontSize: '16px',
  color: '#555555',
  lineHeight: '1.6',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const locationTag = {
  fontWeight: '400' as const,
  color: '#bbbbbb',
  letterSpacing: '0.05em',
};
