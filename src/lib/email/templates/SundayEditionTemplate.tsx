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

export interface SundayEditionAd {
  sponsorLabel: string;
  imageUrl: string | null;
  headline: string;
  body: string | null;
  clickUrl: string;
}

export interface SundayEditionContent {
  neighborhoodName: string;
  cityName: string;
  date: string;
  rearviewNarrative: string;
  rearviewStories: RearviewStory[];
  horizonEvents: HorizonEvent[];
  dataPoint: WeeklyDataPoint;
  holidaySection?: HolidaySection | null;
  sponsorAd?: SundayEditionAd | null;
  imageUrl: string | null;
  articleUrl: string | null;
  unsubscribeUrl: string;
  preferencesUrl: string;
  referralUrl?: string;
  secondaryNeighborhoods?: { id: string; name: string; cityName: string }[];
  requestBaseUrl?: string;
  requestToken?: string;
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
      <Head>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap');`}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Masthead — Letterhead style */}
          <Section style={mastheadSection}>
            <Text style={mastheadBrand}><Link href="https://readflaneur.com" style={mastheadBrandLink}>FLANEUR</Link></Text>
            <Text style={mastheadSubhead}>
              The Sunday Edition: {content.neighborhoodName}
            </Text>
            <Text style={mastheadDate}>{content.date}</Text>
          </Section>

          {/* Double rule divider */}
          <Hr style={ruleThick} />
          <Hr style={ruleThin} />

          {/* Data Point (Weather) — hero position, like Daily Brief */}
          {content.dataPoint.value !== 'Data unavailable this week' && (
            <Section style={dataPointSection}>
              <Link href={content.dataPoint.type === 'environment' ? weatherSearchUrl : '#'} style={dataPointLink}>
                <Text style={dataPointLabel}>{content.dataPoint.label.toUpperCase()}</Text>
                <Text style={dataPointValue}>{content.dataPoint.value}</Text>
                {content.dataPoint.context && (
                  <Text style={dataPointContext}>{content.dataPoint.context}</Text>
                )}
              </Link>
            </Section>
          )}

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

          {/* Section 1: The Letter */}
          <Section style={sectionContainer}>
            <Text style={sectionLabel}>THE LETTER</Text>
            <Text style={sectionSubtitle}>The past seven days, distilled.</Text>

            <Text style={narrativeText}>{teaserParagraph}</Text>

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

          {/* Presenting Sponsor — NativeAd style */}
          {content.sponsorAd && (
            <>
              <Section style={sponsorSection}>
                <Text style={sponsorEyebrow}>Sponsored</Text>
                {content.sponsorAd.imageUrl && (
                  <Link href={content.sponsorAd.clickUrl}>
                    <Img
                      src={content.sponsorAd.imageUrl}
                      alt={content.sponsorAd.headline}
                      width="100%"
                      style={sponsorImage}
                    />
                  </Link>
                )}
                <Link href={content.sponsorAd.clickUrl} style={sponsorHeadlineLink}>
                  <Text style={sponsorHeadline}>{content.sponsorAd.headline}</Text>
                </Link>
                {content.sponsorAd.body && (
                  <Text style={sponsorBody}>{content.sponsorAd.body}</Text>
                )}
                <Text style={sponsorLabel}>{content.sponsorAd.sponsorLabel}</Text>
              </Section>

              <Hr style={divider} />
            </>
          )}

          {/* Section 2: The Horizon */}
          {content.horizonEvents.length > 0 && (
            <>
              <Section style={sectionContainer}>
                <Text style={sectionLabel}>THE NEXT FEW DAYS</Text>
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

          {/* Your Other Editions */}
          {content.secondaryNeighborhoods && content.secondaryNeighborhoods.length > 0 && content.requestBaseUrl && content.requestToken && (
            <>
              <Section style={otherEditionsSection}>
                <Text style={sectionLabel}>YOUR OTHER EDITIONS</Text>
                <Text style={otherEditionsSubtitle}>Request the Sunday Edition for your other neighborhoods.</Text>
                {content.secondaryNeighborhoods.map((hood, i) => (
                  <Text key={i} style={otherEditionItem}>
                    <Link
                      href={`${content.requestBaseUrl}?token=${content.requestToken}&neighborhood=${hood.id}`}
                      style={otherEditionLink}
                    >
                      {hood.name}, {hood.cityName} &rarr;
                    </Link>
                  </Text>
                ))}
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
              {content.referralUrl && (
                <>
                  {' · '}
                  <Link href={content.referralUrl} style={footerLink}>
                    Share Flaneur
                  </Link>
                </>
              )}
              {' · '}
              <Link href={content.unsubscribeUrl} style={footerLink}>
                Unsubscribe
              </Link>
            </Text>
            <Text style={copyrightText}>
              &copy; FLANEUR {new Date().getFullYear()}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ─── Global ───

const bodyStyle = {
  backgroundColor: '#FDFBF7',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  margin: '0',
  padding: '0',
};

const containerStyle = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '0 16px',
  backgroundColor: '#FDFBF7',
};

// ─── Masthead ───

const mastheadSection = {
  textAlign: 'center' as const,
  padding: '40px 0 16px',
};

const mastheadBrand = {
  fontSize: '28px',
  fontWeight: '400' as const,
  letterSpacing: '0.25em',
  color: '#1a1a1a',
  margin: '0 0 6px',
  fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
  textTransform: 'uppercase' as const,
};

const mastheadBrandLink = {
  color: '#1a1a1a',
  textDecoration: 'none' as const,
};

const mastheadSubhead = {
  fontSize: '11px',
  fontWeight: '400' as const,
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  color: '#999999',
  margin: '0 0 4px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const mastheadDate = {
  fontSize: '11px',
  color: '#b0b0b0',
  margin: '4px 0 0',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

// ─── Double rule ───

const ruleThick = {
  borderTop: '2px solid #1a1a1a',
  margin: '0',
};

const ruleThin = {
  borderTop: '1px solid #1a1a1a',
  margin: '2px 0 0',
};

// ─── Shared ───

const divider = {
  borderTop: '1px solid #e8e0d4',
  margin: '0',
};

const heroSection = {
  padding: '24px 0 0',
};

const heroImage = {
  display: 'block' as const,
  width: '100%',
  maxHeight: '300px',
  objectFit: 'cover' as const,
};

const sectionContainer = {
  padding: '28px 0',
};

const sectionLabel = {
  fontSize: '12px',
  fontWeight: '600' as const,
  letterSpacing: '0.2em',
  color: '#C9A96E',
  margin: '0 0 4px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  textTransform: 'uppercase' as const,
};

const sectionSubtitle = {
  fontSize: '14px',
  fontStyle: 'italic' as const,
  color: '#999999',
  margin: '0 0 20px',
  fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
};

// ─── The Letter ───

const narrativeText = {
  fontSize: '17px',
  lineHeight: '1.75',
  color: '#333333',
  margin: '0 0 16px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const continueReadingText = {
  fontSize: '15px',
  margin: '0 0 24px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const continueReadingLink = {
  color: '#C9A96E',
  textDecoration: 'none' as const,
  fontWeight: '600' as const,
};

// ─── Three Stories ───

const storiesBox = {
  borderLeft: '2px solid rgba(201, 169, 110, 0.5)',
  padding: '0 0 0 20px',
  marginTop: '16px',
};

const storiesBoxTitle = {
  fontSize: '11px',
  fontWeight: '600' as const,
  letterSpacing: '0.15em',
  color: '#999999',
  margin: '0 0 12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  textTransform: 'uppercase' as const,
};

const storyItem = {
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#333333',
  margin: '0 0 14px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const storyNumber = {
  fontWeight: '700' as const,
  color: '#C9A96E',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const storyHeadlineLink = {
  fontWeight: '700' as const,
  color: '#1a1a1a',
  textDecoration: 'none' as const,
  fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
};

const storySignificance = {
  fontWeight: '400' as const,
  color: '#666666',
};

// ─── Read More ───

const readMoreText = {
  fontSize: '15px',
  margin: '20px 0 0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const readMoreLink = {
  color: '#C9A96E',
  textDecoration: 'none' as const,
  fontWeight: '600' as const,
};

// ─── Sponsor (NativeAd style) ───

const sponsorSection = {
  padding: '28px 0',
  textAlign: 'center' as const,
};

const sponsorEyebrow = {
  fontSize: '10px',
  fontWeight: '600' as const,
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  color: '#bbbbbb',
  margin: '0 0 10px',
  textAlign: 'center' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const sponsorImage = {
  display: 'block' as const,
  width: '100%',
  borderRadius: '4px',
  marginBottom: '12px',
};

const sponsorHeadlineLink = {
  textDecoration: 'none' as const,
};

const sponsorHeadline = {
  fontSize: '18px',
  fontWeight: '600' as const,
  color: '#1a1a1a',
  margin: '0 0 6px',
  lineHeight: '1.3',
  textAlign: 'center' as const,
  fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
};

const sponsorBody = {
  fontSize: '15px',
  color: '#555555',
  lineHeight: '1.6',
  margin: '0 0 8px',
  textAlign: 'center' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const sponsorLabel = {
  fontSize: '11px',
  color: '#999999',
  margin: '0',
  textAlign: 'center' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

// ─── Events (Horizon + Holiday) ───

const eventItem = {
  marginBottom: '20px',
  paddingLeft: '16px',
  borderLeft: '2px solid #E8E0D4',
};

const eventDay = {
  fontSize: '10px',
  fontWeight: '600' as const,
  letterSpacing: '0.2em',
  color: '#C9A96E',
  margin: '0 0 2px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  textTransform: 'uppercase' as const,
};

const eventName = {
  fontSize: '17px',
  fontWeight: '600' as const,
  color: '#1a1a1a',
  margin: '0 0 4px',
  fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
};

const eventNameLink = {
  color: '#1a1a1a',
  textDecoration: 'none' as const,
};

const eventWhy = {
  fontSize: '16px',
  color: '#555555',
  lineHeight: '1.6',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

// ─── Holiday ───

const holidayNameStyle = {
  fontSize: '22px',
  fontWeight: '600' as const,
  color: '#1a1a1a',
  margin: '0 0 4px',
  fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
};

const holidayDateStyle = {
  fontSize: '13px',
  color: '#999999',
  margin: '0 0 20px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

// ─── Data Point ───

const dataPointSection = {
  padding: '28px 0',
  textAlign: 'center' as const,
};

const dataPointLink = {
  textDecoration: 'none' as const,
};

const dataPointLabel = {
  fontSize: '12px',
  fontWeight: '600' as const,
  letterSpacing: '0.2em',
  color: '#C9A96E',
  margin: '0 0 4px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  textTransform: 'uppercase' as const,
};

const dataPointValue = {
  fontSize: '36px',
  fontWeight: '700' as const,
  color: '#1a1a1a',
  margin: '8px 0',
  fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
};

const dataPointContext = {
  fontSize: '15px',
  color: '#555555',
  lineHeight: '1.6',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

// ─── Other Editions ───

const otherEditionsSection = {
  padding: '28px 0',
  textAlign: 'center' as const,
};

const otherEditionsSubtitle = {
  fontSize: '14px',
  color: '#999999',
  margin: '0 0 16px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const otherEditionItem = {
  fontSize: '16px',
  margin: '0 0 10px',
  textAlign: 'center' as const,
  fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
};

const otherEditionLink = {
  color: '#C9A96E',
  textDecoration: 'none' as const,
  fontWeight: '600' as const,
};

// ─── Footer ───

const footerSection = {
  padding: '24px 0',
  textAlign: 'center' as const,
};

const footerText = {
  fontSize: '13px',
  color: '#999999',
  margin: '0 0 8px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const footerLinks = {
  fontSize: '13px',
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
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
