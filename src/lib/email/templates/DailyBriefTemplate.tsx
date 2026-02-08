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
import { WeatherWidget } from './components/WeatherWidget';
import { WeatherStoryCard } from './components/WeatherStoryCard';
import { HeroStory } from './components/HeroStory';
import { StoryList } from './components/StoryList';
import { NativeAd } from './components/NativeAd';
import { SatelliteSection } from './components/SatelliteSection';
import { Footer } from './components/Footer';

export function DailyBriefTemplate(content: DailyBriefContent) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';
  const unsubscribeUrl = `${appUrl}/api/email/unsubscribe?token=${content.recipient.unsubscribeToken}`;
  const preferencesUrl = `${appUrl}/email/preferences?token=${content.recipient.unsubscribeToken}`;

  const primaryName = content.primarySection?.neighborhoodName || 'your neighborhoods';
  const previewText = `Your morning brief from ${primaryName}`;

  const primary = content.primarySection;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Header date={content.date} headerAd={content.headerAd} />

          {primary && (
            <Section>
              {/* Neighborhood title */}
              <Text style={neighborhoodTitle}>
                {primary.neighborhoodName}
                <span style={citySubtitle}> &middot; {primary.cityName}</span>
              </Text>

              {/* Weather: story card replaces widget when available */}
              {primary.weatherStory ? (
                <WeatherStoryCard story={primary.weatherStory} />
              ) : primary.weather ? (
                <WeatherWidget
                  weather={primary.weather}
                  neighborhoodName={primary.neighborhoodName}
                />
              ) : null}

              {/* Hero story (first story with full image) */}
              {primary.stories.length > 0 && (
                <HeroStory story={primary.stories[0]} />
              )}

              {/* Second story */}
              {primary.stories.length > 1 && (
                <StoryList stories={primary.stories.slice(1, 2)} />
              )}

              {/* Native ad injected at position 2 */}
              {content.nativeAd && <NativeAd ad={content.nativeAd} />}

              {/* Remaining stories */}
              {primary.stories.length > 2 && (
                <StoryList stories={primary.stories.slice(2)} />
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

          {/* Satellite neighborhoods */}
          {content.satelliteSections.map((section, i) => (
            <SatelliteSection key={i} section={section} />
          ))}

          <Footer
            unsubscribeUrl={unsubscribeUrl}
            preferencesUrl={preferencesUrl}
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

const neighborhoodTitle = {
  fontSize: '20px',
  fontWeight: '700' as const,
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
  color: '#000000',
  margin: '0 0 12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const citySubtitle = {
  fontWeight: '400' as const,
  color: '#999999',
  textTransform: 'none' as const,
  letterSpacing: '0',
  fontSize: '15px',
};

const emptyState = {
  fontSize: '14px',
  color: '#999999',
  textAlign: 'center' as const,
  padding: '40px 0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
