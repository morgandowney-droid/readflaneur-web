import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
  Img,
  Hr,
  Preview,
} from '@react-email/components';
import type { HorizonEvent, WeeklyDataPoint, RearviewStory, HolidaySection } from '../../weekly-brief-service';

export interface SundayEditionContent {
  neighborhoodName: string;
  cityName: string;
  date: string;
  rearviewNarrative: string;
  rearviewStories: RearviewStory[];
  horizonEvents: HorizonEvent[];
  dataPoint: WeeklyDataPoint;
  holidaySection?: HolidaySection | null;
  imageUrl: string | null;
  articleUrl: string | null;
  unsubscribeUrl: string;
  preferencesUrl: string;
}

export function SundayEditionTemplate(content: SundayEditionContent) {
  const preview = `The Sunday Edition: ${content.neighborhoodName} - Your week in review and the week ahead.`;

  // Split narrative into paragraphs and show first as teaser
  const paragraphs = content.rearviewNarrative
    .split(/\n\n+/)
    .filter(p => p.trim().length > 0);

  // If it's a single block, try splitting on sentences at ~150 chars
  let teaserParagraph = paragraphs[0] || '';
  let remainingParagraphs = paragraphs.slice(1);

  if (paragraphs.length === 1 && teaserParagraph.length > 200) {
    // Split single block into teaser + rest at first sentence boundary after 120 chars
    const sentenceBreak = teaserParagraph.indexOf('. ', 120);
    if (sentenceBreak > 0 && sentenceBreak < teaserParagraph.length - 50) {
      remainingParagraphs = [teaserParagraph.slice(sentenceBreak + 2)];
      teaserParagraph = teaserParagraph.slice(0, sentenceBreak + 1);
    }
  }

  // Build Google search URL for weather
  const weatherSearchUrl = `https://www.google.com/search?q=${encodeURIComponent('weather ' + content.neighborhoodName + ' ' + content.cityName)}`;

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Masthead */}
          <Section style={mastheadSection}>
            <Text style={mastheadBrand}>FLANEUR</Text>
            <Text style={mastheadTitle}>The Sunday Edition</Text>
            <Text style={mastheadNeighborhood}>
              {content.neighborhoodName.toUpperCase()}
              <span style={mastheadCity}> &middot; {content.cityName}</span>
            </Text>
            <Text style={mastheadDate}>{content.date}</Text>
          </Section>

          <Hr style={divider} />

          {/* Hero Image */}
          {content.imageUrl && (
            <Section style={heroSection}>
              <Img
                src={content.imageUrl}
                alt={`The Sunday Edition: ${content.neighborhoodName}`}
                width="100%"
                style={heroImage}
              />
            </Section>
          )}

          {/* Section 1: The Rearview */}
          <Section style={sectionContainer}>
            <Text style={sectionLabel}>THE REARVIEW</Text>
            <Text style={sectionSubtitle}>The past seven days, distilled.</Text>

            {/* Teaser paragraph */}
            <Text style={narrativeText}>{teaserParagraph}</Text>

            {/* Continue reading link (shown when there's more content) */}
            {(remainingParagraphs.length > 0 || content.articleUrl) && content.articleUrl && (
              <Text style={continueReadingText}>
                <Link href={content.articleUrl} style={continueReadingLink}>
                  Continue reading &rarr;
                </Link>
              </Text>
            )}

            {content.rearviewStories.length > 0 && (
              <Section style={storiesBox}>
                <Text style={storiesBoxTitle}>THREE STORIES THAT MATTERED</Text>
                {content.rearviewStories.map((story, i) => {
                  const storySearchUrl = `https://www.google.com/search?q=${encodeURIComponent(story.headline + ' ' + content.neighborhoodName + ' ' + content.cityName)}`;
                  return (
                    <Text key={i} style={storyItem}>
                      <span style={storyNumber}>{i + 1}.</span>{' '}
                      <Link href={storySearchUrl} style={storyHeadlineLink}>{story.headline}</Link>
                      {story.significance && (
                        <span style={storySignificance}> - {story.significance}</span>
                      )}
                    </Text>
                  );
                })}
              </Section>
            )}

            {content.articleUrl && (
              <Text style={readMoreText}>
                <Link href={content.articleUrl} style={readMoreLink}>
                  Read the full edition on Flaneur &rarr;
                </Link>
              </Text>
            )}
          </Section>

          <Hr style={divider} />

          {/* Section 2: The Horizon */}
          {content.horizonEvents.length > 0 && (
            <>
              <Section style={sectionContainer}>
                <Text style={sectionLabel}>THE HORIZON</Text>
                <Text style={sectionSubtitle}>Your week ahead, curated.</Text>

                {content.horizonEvents.map((event, i) => {
                  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(event.name + ' ' + content.neighborhoodName + ' ' + content.cityName)}`;
                  return (
                    <Section key={i} style={eventItem}>
                      <Text style={eventDay}>{event.day.toUpperCase()}</Text>
                      <Text style={eventName}>
                        <Link href={searchUrl} style={eventNameLink}>{event.name}</Link>
                      </Text>
                      <Text style={eventWhy}>{event.whyItMatters}</Text>
                      <Text style={eventCategory}>{event.category}</Text>
                    </Section>
                  );
                })}
              </Section>

              <Hr style={divider} />
            </>
          )}

          {/* Holiday Section: That Time of Year */}
          {content.holidaySection && content.holidaySection.events.length > 0 && (
            <>
              <Section style={sectionContainer}>
                <Text style={sectionLabel}>THAT TIME OF YEAR</Text>
                <Text style={holidayNameStyle}>{content.holidaySection.holidayName}</Text>
                <Text style={holidayDateStyle}>{content.holidaySection.date}</Text>

                {content.holidaySection.events.map((event, i) => {
                  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(event.name + ' ' + content.neighborhoodName + ' ' + content.cityName)}`;
                  return (
                    <Section key={i} style={eventItem}>
                      <Text style={eventDay}>{event.day.toUpperCase()}</Text>
                      <Text style={eventName}>
                        <Link href={searchUrl} style={eventNameLink}>{event.name}</Link>
                      </Text>
                      <Text style={eventWhy}>{event.description}</Text>
                    </Section>
                  );
                })}
              </Section>

              <Hr style={divider} />
            </>
          )}

          {/* Section 3: The Data Point (clickable for weather) */}
          {content.dataPoint.value !== 'Data unavailable this week' && (
            <>
              <Section style={dataPointSection}>
                <Link href={content.dataPoint.type === 'environment' ? weatherSearchUrl : '#'} style={dataPointLink}>
                  <Text style={sectionLabel}>{content.dataPoint.label.toUpperCase()}</Text>
                  <Text style={dataPointValue}>{content.dataPoint.value}</Text>
                  {content.dataPoint.context && (
                    <Text style={dataPointContext}>{content.dataPoint.context}</Text>
                  )}
                </Link>
              </Section>

              <Hr style={divider} />
            </>
          )}

          {/* Footer */}
          <Section style={footerSection}>
            <Text style={footerText}>
              The Sunday Edition is published weekly by{' '}
              <Link href="https://readflaneur.com" style={footerLink}>Flaneur</Link>.
            </Text>
            <Text style={footerLinks}>
              <Link href={content.preferencesUrl} style={footerLink}>
                Manage preferences
              </Link>
              {' · '}
              <Link href={content.unsubscribeUrl} style={footerLink}>
                Unsubscribe
              </Link>
            </Text>
            <Text style={copyrightText}>
              &copy; Flaneur {new Date().getFullYear()}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ─── Styles ───

const bodyStyle = {
  backgroundColor: '#FDF8F0',
  fontFamily: 'Georgia, "Times New Roman", serif',
  margin: '0',
  padding: '0',
};

const containerStyle = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '0',
  backgroundColor: '#FFFFFF',
};

const mastheadSection = {
  textAlign: 'center' as const,
  padding: '40px 30px 20px',
  backgroundColor: '#1a1a1a',
};

const mastheadBrand = {
  fontSize: '11px',
  fontWeight: '400' as const,
  letterSpacing: '4px',
  color: '#C9A96E',
  margin: '0 0 4px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  textTransform: 'uppercase' as const,
};

const mastheadTitle = {
  fontSize: '28px',
  fontWeight: '400' as const,
  letterSpacing: '1px',
  color: '#FFFFFF',
  margin: '0 0 12px',
  fontFamily: 'Georgia, "Times New Roman", serif',
};

const mastheadNeighborhood = {
  fontSize: '14px',
  fontWeight: '600' as const,
  letterSpacing: '2px',
  color: '#FFFFFF',
  margin: '0 0 4px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const mastheadCity = {
  fontWeight: '400' as const,
  color: '#999999',
};

const mastheadDate = {
  fontSize: '12px',
  color: '#888888',
  margin: '8px 0 0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const divider = {
  borderColor: '#E8E0D4',
  borderWidth: '1px',
  margin: '0',
};

const heroSection = {
  padding: '0',
};

const heroImage = {
  display: 'block' as const,
  width: '100%',
  maxHeight: '300px',
  objectFit: 'cover' as const,
};

const sectionContainer = {
  padding: '30px',
};

const sectionLabel = {
  fontSize: '14px',
  fontWeight: '700' as const,
  letterSpacing: '3px',
  color: '#C9A96E',
  margin: '0 0 6px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  textTransform: 'uppercase' as const,
};

const sectionSubtitle = {
  fontSize: '14px',
  fontStyle: 'italic' as const,
  color: '#888888',
  margin: '0 0 20px',
  fontFamily: 'Georgia, "Times New Roman", serif',
};

const narrativeText = {
  fontSize: '17px',
  lineHeight: '1.7',
  color: '#2a2a2a',
  margin: '0 0 16px',
  fontFamily: 'Georgia, "Times New Roman", serif',
};

const continueReadingText = {
  fontSize: '15px',
  margin: '0 0 24px',
  fontFamily: 'Georgia, "Times New Roman", serif',
};

const continueReadingLink = {
  color: '#C9A96E',
  textDecoration: 'none' as const,
  fontWeight: '600' as const,
};

const storiesBox = {
  backgroundColor: '#FAF7F2',
  borderLeft: '3px solid #C9A96E',
  padding: '16px 20px',
  marginTop: '16px',
};

const storiesBoxTitle = {
  fontSize: '11px',
  fontWeight: '600' as const,
  letterSpacing: '2px',
  color: '#999999',
  margin: '0 0 12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const storyItem = {
  fontSize: '15px',
  lineHeight: '1.5',
  color: '#333333',
  margin: '0 0 12px',
  fontFamily: 'Georgia, "Times New Roman", serif',
};

const storyNumber = {
  fontWeight: '700' as const,
  color: '#C9A96E',
};

const storyHeadlineLink = {
  fontWeight: '600' as const,
  color: '#1a1a1a',
  textDecoration: 'underline' as const,
  textDecorationColor: '#C9A96E',
  textUnderlineOffset: '3px',
};

const storySignificance = {
  fontWeight: '400' as const,
  color: '#555555',
};

const eventItem = {
  marginBottom: '20px',
  paddingLeft: '16px',
  borderLeft: '2px solid #E8E0D4',
};

const eventDay = {
  fontSize: '11px',
  fontWeight: '700' as const,
  letterSpacing: '2px',
  color: '#C9A96E',
  margin: '0 0 2px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const eventName = {
  fontSize: '16px',
  fontWeight: '600' as const,
  color: '#1a1a1a',
  margin: '0 0 4px',
  fontFamily: 'Georgia, "Times New Roman", serif',
};

const eventNameLink = {
  color: '#1a1a1a',
  textDecoration: 'underline' as const,
  textDecorationColor: '#C9A96E',
  textUnderlineOffset: '3px',
};

const eventWhy = {
  fontSize: '15px',
  color: '#444444',
  lineHeight: '1.5',
  margin: '0 0 2px',
  fontFamily: 'Georgia, "Times New Roman", serif',
};

const eventCategory = {
  fontSize: '11px',
  fontWeight: '500' as const,
  letterSpacing: '1px',
  color: '#999999',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  textTransform: 'uppercase' as const,
};

const holidayNameStyle = {
  fontSize: '22px',
  fontWeight: '600' as const,
  color: '#1a1a1a',
  margin: '0 0 4px',
  fontFamily: 'Georgia, "Times New Roman", serif',
};

const holidayDateStyle = {
  fontSize: '14px',
  color: '#888888',
  margin: '0 0 20px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const dataPointSection = {
  padding: '30px',
  textAlign: 'center' as const,
};

const dataPointLink = {
  textDecoration: 'none' as const,
};

const dataPointValue = {
  fontSize: '36px',
  fontWeight: '700' as const,
  color: '#1a1a1a',
  margin: '8px 0',
  fontFamily: 'Georgia, "Times New Roman", serif',
};

const dataPointContext = {
  fontSize: '15px',
  color: '#555555',
  lineHeight: '1.5',
  margin: '0',
  fontFamily: 'Georgia, "Times New Roman", serif',
};

const readMoreText = {
  fontSize: '15px',
  margin: '20px 0 0',
  fontFamily: 'Georgia, "Times New Roman", serif',
};

const readMoreLink = {
  color: '#C9A96E',
  textDecoration: 'none' as const,
  fontWeight: '600' as const,
};

const footerSection = {
  padding: '24px 30px',
  backgroundColor: '#FAF7F2',
  textAlign: 'center' as const,
};

const footerText = {
  fontSize: '12px',
  color: '#999999',
  margin: '0 0 8px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const footerLinks = {
  fontSize: '12px',
  color: '#999999',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const footerLink = {
  color: '#C9A96E',
  textDecoration: 'none' as const,
};

const copyrightText = {
  fontSize: '11px',
  color: '#cccccc',
  textAlign: 'center' as const,
  margin: '16px 0 0',
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
