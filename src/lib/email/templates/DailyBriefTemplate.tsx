import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
} from '@react-email/components';
import { DailyBriefContent } from '../types';
import { Header } from './components/Header';
import { WeatherStoryCard } from './components/WeatherStoryCard';
import { StoryList } from './components/StoryList';
import { NativeAd } from './components/NativeAd';
import { SatelliteSection } from './components/SatelliteSection';
import { FamilyCornerSection } from './components/FamilyCornerSection';
import { Footer } from './components/Footer';

export function DailyBriefTemplate(content: DailyBriefContent) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';
  const unsubscribeUrl = `${appUrl}/api/email/unsubscribe?token=${content.recipient.unsubscribeToken}`;
  const preferencesUrl = `${appUrl}/email/preferences?token=${content.recipient.unsubscribeToken}`;
  const referralUrl = content.recipient.referralCode
    ? `${appUrl}/invite?ref=${content.recipient.referralCode}`
    : undefined;

  const primaryName = content.primarySection?.neighborhoodName || 'your neighborhoods';
  const hasSatellites = content.satelliteSections.length > 0;
  const previewText = `Your morning brief from ${primaryName}${hasSatellites ? '+' : ''}`;

  const primary = content.primarySection;

  return (
    <Html>
      <Head>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap');`}</style>
      </Head>
      <div style={previewHidden}>{previewText}</div>
      <Body style={main}>
        <Container style={container}>
          <Header date={content.date} headerAd={content.headerAd} />

          {primary && (
            <Section>
              {/* Location + Weather as one grouped thought */}
              <Section style={heroBlock}>
                {(() => {
                  const combined = primary.cityName ? `${primary.neighborhoodName} · ${primary.cityName}` : primary.neighborhoodName;
                  const stack = combined.length > 25;
                  if (stack && primary.cityName) {
                    return (
                      <>
                        <Text style={locationLabelStacked}>{primary.neighborhoodName}</Text>
                        <Text style={locationCityLine}>{primary.cityName}</Text>
                      </>
                    );
                  }
                  return (
                    <Text style={locationLabel}>
                      {primary.neighborhoodName}
                      {primary.cityName && (
                        <span style={locationCity}> &middot; {primary.cityName}</span>
                      )}
                    </Text>
                  );
                })()}
                {(primary.weather || primary.weatherStory) && (() => {
                  const tempC = primary.weatherStory?.temperatureC ?? primary.weather?.temperatureC ?? null;
                  const tempF = primary.weatherStory?.temperatureF ?? primary.weather?.temperatureF ?? null;
                  const useF = primary.weatherStory?.useFahrenheit ?? primary.weather?.useFahrenheit ?? false;
                  const desc = primary.weather?.description || '';
                  if (tempC === null && tempF === null) return null;
                  const tempValue = useF ? `${Math.round(tempF!)}°F` : `${Math.round(tempC!)}°C`;
                  const weatherSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(primary.neighborhoodName + ' ' + (primary.cityName || '') + ' weather')}`;
                  return (
                    <>
                      <Text style={tempHero}>
                        <a href={weatherSearchUrl} style={tempLink}>{tempValue}</a>
                      </Text>
                      {desc && <Text style={tempDesc}>{desc}</Text>}
                      {primary.weatherStory && primary.weatherStory.priority > 1 && (
                        <>
                          <Text style={weatherHint}>{primary.weatherStory.headline}</Text>
                          {primary.weatherStory.body ? (
                            <Text style={weatherHint}>{primary.weatherStory.body}</Text>
                          ) : null}
                        </>
                      )}
                    </>
                  );
                })()}
              </Section>

              {/* Weather story card — alerts only (priority 1: blizzard, extreme heat) */}
              {primary.weatherStory && primary.weatherStory.priority === 1 && (
                <WeatherStoryCard story={primary.weatherStory} />
              )}

              {/* Primary stories */}
              {primary.stories.length > 0 && (
                <StoryList stories={primary.stories} variant="primary" />
              )}

              {/* Native ad after all primary stories */}
              {content.nativeAd && <NativeAd ad={content.nativeAd} />}

              {/* Jump link to Family Corner */}
              {content.familyCorner && (
                <Section style={{ paddingTop: '12px', paddingBottom: '8px', textAlign: 'center' as const }}>
                  <a href="#family-corner" style={familyCornerJumpLink}>
                    Jump to your Family Corner &darr;
                  </a>
                </Section>
              )}

              {/* Inline referral CTA */}
              {referralUrl && (
                <Section style={referralCard}>
                  <Text style={referralText}>
                    Know someone who&apos;d enjoy this?{' '}
                    <a href={referralUrl} style={referralLink}>Share Flaneur</a>{' '}
                    or forward this email.
                  </Text>
                </Section>
              )}
            </Section>
          )}

          {!primary && (
            <Section>
              <Text style={emptyState}>
                No stories available today. Check back tomorrow.
              </Text>
            </Section>
          )}

          {/* Look Ahead link */}
          {content.lookAheadUrl && primary && (
            <Section style={{ paddingTop: '8px', paddingBottom: '16px', textAlign: 'center' as const }}>
              <a
                href={content.lookAheadUrl}
                style={{
                  color: '#C9A96E',
                  textDecoration: 'none',
                  fontWeight: '600',
                  fontSize: '14px',
                  fontFamily: "'Playfair Display', Georgia, serif",
                }}
              >
                Read the Look Ahead (next 7 days) for {primary.neighborhoodName} &rsaquo;
              </a>
            </Section>
          )}

          {/* Satellite neighborhoods */}
          {content.satelliteSections.length > 0 && (
            <Hr style={sectionDividerDark} />
          )}
          {content.satelliteSections.map((section, i) => (
            <SatelliteSection key={i} section={section} />
          ))}

          {/* Family Corner */}
          {content.familyCorner && (
            <FamilyCornerSection familyCorner={content.familyCorner} />
          )}

          <Footer
            unsubscribeUrl={unsubscribeUrl}
            preferencesUrl={preferencesUrl}
            referralUrl={referralUrl}
          />
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

const container = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '0 16px',
};

const heroBlock = {
  padding: '24px 0 16px',
  textAlign: 'center' as const,
};

const locationLabel = {
  fontSize: '12px',
  fontWeight: '400' as const,
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  color: '#1a1a1a',
  margin: '0 0 8px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const locationLabelStacked = {
  fontSize: '12px',
  fontWeight: '400' as const,
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  color: '#1a1a1a',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const locationCityLine = {
  fontSize: '12px',
  fontWeight: '400' as const,
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  color: '#b0b0b0',
  margin: '2px 0 8px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const locationCity = {
  color: '#b0b0b0',
  letterSpacing: '0.15em',
};

const tempHero = {
  fontSize: '48px',
  fontWeight: '700' as const,
  color: '#1a1a1a',
  margin: '0',
  lineHeight: '1',
  fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
};

const tempLink = {
  color: '#1a1a1a',
  textDecoration: 'none',
};

const tempDesc = {
  fontSize: '13px',
  color: '#999999',
  margin: '4px 0 0',
  textTransform: 'capitalize' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const weatherHint = {
  fontSize: '13px',
  color: '#999999',
  margin: '2px 0 0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const emptyState = {
  fontSize: '14px',
  color: '#999999',
  textAlign: 'center' as const,
  padding: '40px 0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const familyCornerJumpLink = {
  color: '#C9A96E',
  textDecoration: 'none',
  fontWeight: '600' as const,
  fontSize: '14px',
  fontFamily: "'Playfair Display', Georgia, serif",
};

const sectionDividerDark = {
  borderTop: '1px solid #999999',
  margin: '8px 0 0',
};

const referralCard = {
  padding: '16px 0',
  textAlign: 'center' as const,
};

const referralText = {
  fontSize: '13px',
  color: '#999999',
  margin: '0',
  lineHeight: '1.5',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const referralLink = {
  color: '#171717',
  fontWeight: 600 as const,
  textDecoration: 'underline',
};

const previewHidden = {
  display: 'none',
  fontSize: '1px',
  lineHeight: '1px',
  maxHeight: '0',
  maxWidth: '0',
  opacity: 0,
  overflow: 'hidden',
};
