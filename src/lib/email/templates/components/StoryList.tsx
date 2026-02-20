import { Section, Text, Link, Hr } from '@react-email/components';
import { EmailStory } from '../../types';

function truncateAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  // Find the last sentence-ending punctuation
  const lastPeriod = slice.lastIndexOf('.');
  const lastExcl = slice.lastIndexOf('!');
  const lastQuestion = slice.lastIndexOf('?');
  const lastEnd = Math.max(lastPeriod, lastExcl, lastQuestion);
  if (lastEnd > 0) {
    return text.slice(0, lastEnd + 1);
  }
  // No sentence boundary found - fall back to word boundary, no ellipsis
  const lastSpace = slice.lastIndexOf(' ');
  return lastSpace > 0 ? text.slice(0, lastSpace) : slice;
}

interface StoryListProps {
  stories: EmailStory[];
  variant?: 'primary' | 'default';
}

function ShareLinks({ story }: { story: EmailStory }) {
  const text = encodeURIComponent(story.headline);
  const url = encodeURIComponent(story.articleUrl);
  const xUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
  return (
    <Text style={shareRow}>
      <Link href={xUrl} style={shareLink}>Share on X</Link>
      <span style={shareDot}>{' '}&middot;{' '}</span>
      <Link href={fbUrl} style={shareLink}>Facebook</Link>
    </Text>
  );
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
            {story.categoryLabel && story.location && (() => {
              const label = story.categoryLabel || '';
              const loc = story.location || '';
              // If combined line is too long for mobile, drop the city (keep just neighborhood)
              const full = `${label} · ${loc}`;
              const displayLoc = full.length > 50 ? loc.split(',')[0] : loc;
              return (
                <>
                  <span style={locationTag}> &middot; </span>
                  <span style={locationTag}>{displayLoc}</span>
                </>
              );
            })()}
            {!story.categoryLabel && story.location && <span style={locationTag}>{story.location}</span>}
          </Text>
          <Link href={story.articleUrl} style={headlineLink}>
            <Text style={isPrimary ? headlinePrimary : headline}>{story.headline}</Text>
          </Link>
          {story.previewText && (
            <Text style={isPrimary ? previewPrimary : preview}>
              {truncateAtSentence(story.previewText, 160)}
            </Text>
          )}
          {isPrimary && i === 0 && <ShareLinks story={story} />}
        </Section>
      ))}
    </Section>
  );
}

const storyRow = {
  marginBottom: '8px',
};

const divider = {
  borderTop: '1px solid #d5d5d5',
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

const shareRow = {
  fontSize: '12px',
  margin: '8px 0 0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  color: '#bbbbbb',
};

const shareLink = {
  color: '#999999',
  textDecoration: 'none' as const,
  fontSize: '12px',
};

const shareDot = {
  color: '#cccccc',
};
