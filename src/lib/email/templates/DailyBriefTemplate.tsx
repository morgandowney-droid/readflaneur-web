import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
} from '@react-email/components';
import { DailyBriefContent } from '../types';
import { Header } from './components/Header';
import { WeatherStoryCard } from './components/WeatherStoryCard';
import { StoryList } from './components/StoryList';
import { NativeAd } from './components/NativeAd';
import { SatelliteSection } from './components/SatelliteSection';
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
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Header date={content.date} headerAd={content.headerAd} />

          {primary && (
            <Section>
              {/* Location + Weather as one grouped thought */}
              <Section style={heroBlock}>
                <Text style={locationLabel}>
                  {primary.neighborhoodName}
                  {primary.cityName && (
                    <span style={locationCity}> &middot; {primary.cityName}</span>
                  )}
                </Text>
                {(primary.weather || primary.weatherStory) && (() => {
                  const tempC = primary.weatherStory?.temperatureC ?? primary.weather?.temperatureC ?? null;
                  const tempF = primary.weatherStory?.temperatureF ?? primary.weather?.temperatureF ?? null;
                  const useF = primary.weatherStory?.useFahrenheit ?? primary.weather?.useFahrenheit ?? false;
                  const desc = primary.weather?.description || '';
                  if (tempC === null && tempF === null) return null;
                  const tempValue = useF ? `${Math.round(tempF!)}°F` : `${Math.round(tempC!)}°C`;
                  return (
                    <>
                      <Text style={tempHero}>{tempValue}</Text>
                      {desc && <Text style={tempDesc}>{desc}</Text>}
                    </>
                  );
                })()}
              </Section>

              {/* Weather story card (editorial headline + body) */}
              {primary.weatherStory && (
                <WeatherStoryCard story={primary.weatherStory} />
              )}

              {/* Primary stories */}
              {primary.stories.length > 0 && (
                <StoryList stories={primary.stories} variant="primary" />
              )}

              {/* Native ad after all primary stories */}
              {content.nativeAd && <NativeAd ad={content.nativeAd} />}
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
          {content.satelliteSections.map((section, i) => (
            <SatelliteSection key={i} section={section} />
          ))}

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
  padding: '24px 0 24px',
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

const tempDesc = {
  fontSize: '13px',
  color: '#999999',
  margin: '4px 0 0',
  textTransform: 'capitalize' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const emptyState = {
  fontSize: '14px',
  color: '#999999',
  textAlign: 'center' as const,
  padding: '40px 0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
