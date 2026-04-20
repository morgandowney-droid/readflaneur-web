import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Img,
  Link,
  Hr,
} from '@react-email/components';
import { DailyBriefContent } from '../types';
import { WeatherStoryCard } from './components/WeatherStoryCard';
import { StoryList } from './components/StoryList';
import { SatelliteSection } from './components/SatelliteSection';
import { EnrichedBriefBody } from './components/EnrichedBriefBody';

export interface AgentBranding {
  agentName: string;
  agentTitle?: string;
  brokerageName?: string;
  agentPhone?: string;
  agentPhotoUrl?: string;
  listings?: Array<{
    address: string;
    price: string;
    beds?: string;
    baths?: string;
    sqft?: string;
    description?: string;
    photo_url?: string;
    link_url?: string;
  }>;
  subscribeUrl: string;
  // Pitch-preview mode: renders 3 placeholder listing cards and a placeholder
  // photo/contact row so prospective brokers see the full product surface
  // even before they've uploaded their own assets. NEVER true in production sends.
  isPitchPreview?: boolean;
}

interface BrandedDailyBriefProps extends DailyBriefContent {
  agentBranding: AgentBranding;
}

export function BrandedDailyBriefTemplate(content: BrandedDailyBriefProps) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://readflaneur.com';
  const unsubscribeUrl = `${appUrl}/api/email/unsubscribe?token=${content.recipient.unsubscribeToken}`;
  const preferencesUrl = `${appUrl}/email/preferences?token=${content.recipient.unsubscribeToken}`;
  const { agentBranding } = content;

  const primaryStoryBlurb = content.primarySection?.stories?.[0]?.previewText || '';
  const previewText = primaryStoryBlurb || `Your morning brief from ${content.primarySection?.neighborhoodName || 'your neighborhood'}`;

  const primary = content.primarySection;
  const neighborhoodName = primary?.neighborhoodName || '';

  return (
    <Html>
      <Head>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap');`}</style>
      </Head>
      <div style={previewHidden}>{previewText}</div>
      <Body style={main}>
        <Container style={container}>
          {/* Tracking pixel */}
          <img src={`${appUrl}/api/email/pixel?token=${content.recipient.unsubscribeToken}`} width="1" height="1" alt="" style={{ display: 'block', width: '1px', height: '1px', overflow: 'hidden' }} />

          {/* Branded Header - [NEIGHBORHOOD] DAILY + agent line */}
          <Section>
            <Text style={masthead}>{neighborhoodName.toUpperCase()} DAILY</Text>
            <Text style={agentLine}>
              Curated by {agentBranding.agentName}
              {agentBranding.brokerageName && <> &middot; {agentBranding.brokerageName}</>}
            </Text>
            <Text style={dateLine}>{content.date}</Text>
            <Hr style={divider} />
          </Section>

          {primary && (
            <Section>
              {/* Location + Weather hero */}
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
                      {primary.cityName && <span style={locationCity}> &middot; {primary.cityName}</span>}
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
                        <a href={weatherSearchUrl} style={tempHeroLink}>{tempValue}</a>
                      </Text>
                      {desc && <Text style={tempDesc}>{desc}</Text>}
                      {primary.weatherStory && primary.weatherStory.priority > 1 && (
                        <Section style={tomorrowBox}>
                          <Text style={weatherHint}>{primary.weatherStory.headline}</Text>
                          {primary.weatherStory.body ? <Text style={weatherHint}>{primary.weatherStory.body}</Text> : null}
                        </Section>
                      )}
                    </>
                  );
                })()}
              </Section>

              {/* Weather alert card */}
              {primary.weatherStory && primary.weatherStory.priority === 1 && (
                <WeatherStoryCard story={primary.weatherStory} />
              )}

              {/* Full enriched brief body — renders the complete content (greeting, sections, prose, links) */}
              {primary.briefBody ? (
                <EnrichedBriefBody
                  body={primary.briefBody}
                  sources={primary.briefSources}
                  articleUrl={primary.briefArticleUrl}
                  neighborhoodName={primary.neighborhoodName}
                />
              ) : primary.stories.length > 0 ? (
                <StoryList stories={primary.stories} variant="primary" />
              ) : null}

              {/* Pitch-preview placeholder listings (shown only when isPitchPreview and no real listings) */}
              {agentBranding.isPitchPreview && (!agentBranding.listings || agentBranding.listings.length === 0) && (
                <Section>
                  <Text style={placeholderHeader}>Your listings appear here</Text>
                  {[0, 1, 2].map((i) => (
                    <Section key={`ph-${i}`} style={placeholderCard}>
                      <div style={placeholderImage}>
                        <Text style={placeholderImageLabel}>Your listing photo</Text>
                      </div>
                      <Section style={listingBody}>
                        {agentBranding.brokerageName && (
                          <Text style={listingBrokerage}>{agentBranding.brokerageName}</Text>
                        )}
                        <Text style={placeholderAddress}>Your Östermalm listing address</Text>
                        <Text style={placeholderPrice}>Your listing price</Text>
                        <Text style={placeholderDetails}>X BD · X BA · X sqm</Text>
                        <Text style={placeholderDescription}>A short description of the property appears here.</Text>
                        <Section style={listingAgentRow}>
                          <div style={placeholderPhoto}>
                            <Text style={placeholderPhotoLabel}>Your photo</Text>
                          </div>
                          <div>
                            <Text style={listingAgentName}>{agentBranding.agentName}</Text>
                            <Text style={listingAgentMeta}>
                              {[agentBranding.agentTitle || 'Your title', agentBranding.agentPhone || 'Your phone'].join(' · ')}
                            </Text>
                          </div>
                        </Section>
                      </Section>
                    </Section>
                  ))}
                  <Text style={placeholderFootnote}>You can upload up to 3 listings during setup. They appear here, inline, like a section of the newsletter - never as a banner ad.</Text>
                </Section>
              )}

              {/* Agent Listing Cards (replaces NativeAd) */}
              {agentBranding.listings && agentBranding.listings.length > 0 && (
                <Section>
                  {agentBranding.listings.map((listing, i) => (
                    <Section key={i} style={listingCard}>
                      {listing.photo_url && (
                        <div style={listingImageContainer}>
                          {listing.link_url ? (
                            <Link href={listing.link_url}>
                              <Img src={listing.photo_url} alt={listing.address} width="100%" style={listingImage} />
                            </Link>
                          ) : (
                            <Img src={listing.photo_url} alt={listing.address} width="100%" style={listingImage} />
                          )}
                          <div style={justListedBadge}>Just Listed</div>
                        </div>
                      )}
                      <Section style={listingBody}>
                        {agentBranding.brokerageName && (
                          <Text style={listingBrokerage}>{agentBranding.brokerageName}</Text>
                        )}
                        <Text style={listingAddress}>
                          {listing.link_url ? (
                            <Link href={listing.link_url} style={listingAddressLink}>{listing.address}</Link>
                          ) : listing.address}
                        </Text>
                        <Text style={listingPrice}>{listing.price}</Text>
                        {(listing.beds || listing.baths || listing.sqft) && (
                          <Text style={listingDetails}>
                            {[
                              listing.beds && `${listing.beds} BD`,
                              listing.baths && `${listing.baths} BA`,
                              listing.sqft && `${listing.sqft} SF`,
                            ].filter(Boolean).join(' · ')}
                          </Text>
                        )}
                        {listing.description && (
                          <Text style={listingDescription}>{listing.description}</Text>
                        )}
                        {/* Agent card at bottom of listing */}
                        <Section style={listingAgentRow}>
                          {agentBranding.agentPhotoUrl && (
                            <Img src={agentBranding.agentPhotoUrl} alt={agentBranding.agentName} width="44" height="44" style={listingAgentPhoto} />
                          )}
                          <div>
                            <Text style={listingAgentName}>{agentBranding.agentName}</Text>
                            <Text style={listingAgentMeta}>
                              {[agentBranding.agentTitle, agentBranding.agentPhone].filter(Boolean).join(' · ')}
                            </Text>
                          </div>
                        </Section>
                      </Section>
                    </Section>
                  ))}
                </Section>
              )}
            </Section>
          )}

          {!primary && (
            <Section>
              <Text style={emptyState}>No stories available today. Check back tomorrow.</Text>
            </Section>
          )}

          {/* Look Ahead link - always show when briefBody is rendered (no Look Ahead story card to duplicate) */}
          {content.lookAheadUrl && primary && (primary.briefBody || !primary.stories.some(s => s.categoryLabel?.includes('Look Ahead'))) && (
            <Section style={{ paddingTop: '8px', paddingBottom: '16px', textAlign: 'center' as const }}>
              <a href={content.lookAheadUrl} style={{ color: '#C9A96E', textDecoration: 'none', fontWeight: '600', fontSize: '14px', fontFamily: "'Playfair Display', Georgia, serif" }}>
                Read the Look Ahead (next 7 days) for {primary.neighborhoodName} &rsaquo;
              </a>
            </Section>
          )}

          {/* Satellite sections */}
          {content.satelliteSections.length > 0 && <Hr style={sectionDividerDark} />}
          {content.satelliteSections.map((section, i) => (
            <SatelliteSection key={`sat-${i}`} section={section} />
          ))}

          {/* Branded Footer */}
          <BrandedFooter
            agentName={agentBranding.agentName}
            neighborhoodName={neighborhoodName}
            subscribeUrl={agentBranding.subscribeUrl}
            unsubscribeUrl={unsubscribeUrl}
            preferencesUrl={preferencesUrl}
          />
        </Container>
      </Body>
    </Html>
  );
}

function BrandedFooter({
  agentName,
  neighborhoodName,
  subscribeUrl,
  unsubscribeUrl,
  preferencesUrl,
}: {
  agentName: string;
  neighborhoodName: string;
  subscribeUrl: string;
  unsubscribeUrl: string;
  preferencesUrl: string;
}) {
  return (
    <Section style={footerContainer}>
      <Hr style={footerDivider} />
      <Text style={{ ...forwardedText, margin: '0' }}>
        Was this forwarded to you?
      </Text>
      <Text style={forwardedText}>
        <Link href={`https://readflaneur.com${subscribeUrl.replace('https://readflaneur.com', '')}`} style={forwardedLink}>Subscribe here</Link>
        {' '}- it&apos;s free.
      </Text>
      <Hr style={footerLightDivider} />
      <Text style={footerText}>
        You are receiving this because {agentName} added you to {neighborhoodName} Daily.
      </Text>
      <Text style={footerText}>
        Neighborhood stories powered by{' '}
        <Link href="https://readflaneur.com" style={footerLink}>Flaneur</Link>
      </Text>
      <Text style={footerText}>
        <Link href={preferencesUrl} style={footerLink}>Manage preferences</Link>
        {' '}&middot;{' '}
        <Link href={unsubscribeUrl} style={footerLink}>Unsubscribe</Link>
      </Text>
      <Text style={footerCopyright}>&copy; Flaneur {new Date().getFullYear()}</Text>
    </Section>
  );
}

// --- Styles ---

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

const container = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '0 16px',
};

const masthead = {
  fontSize: '22px',
  fontWeight: '400' as const,
  letterSpacing: '0.25em',
  textAlign: 'center' as const,
  padding: '32px 0 0',
  margin: '0',
  color: '#000000',
  fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
};

const agentLine = {
  fontSize: '11px',
  color: '#999999',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  textAlign: 'center' as const,
  margin: '8px 0 0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const dateLine = {
  fontSize: '12px',
  color: '#b0b0b0',
  textAlign: 'center' as const,
  margin: '12px 0 16px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const divider = {
  borderTop: '1px solid #eeeeee',
  marginTop: '0',
  marginBottom: '16px',
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

const tempHeroLink = {
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

const tomorrowBox = {
  border: '1px solid #e5e5e5',
  borderRadius: '12px',
  padding: '8px 20px',
  margin: '10px auto 0',
  // Width is driven by content (display: table on mobile mail clients) — prevents
  // sentences like "Unseasonably Warm Tomorrow (Tue): 16°C." from word-wrapping
  // mid-phrase. Each <Text> inside is a separate paragraph, so sentences still
  // stack one per line naturally.
  maxWidth: '520px',
  backgroundColor: '#fafafa',
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

const sectionDividerDark = {
  borderTop: '1px solid #999999',
  margin: '8px 0 0',
};

// Listing card styles (matching the mockup)
const listingCard = {
  border: '1px solid #e8e4df',
  borderRadius: '12px',
  overflow: 'hidden' as const,
  marginTop: '24px',
  marginBottom: '24px',
};

const listingImageContainer = {
  position: 'relative' as const,
};

const listingImage = {
  width: '100%',
  display: 'block' as const,
};

const justListedBadge = {
  position: 'absolute' as const,
  top: '12px',
  left: '12px',
  background: 'rgba(0,0,0,0.65)',
  color: 'white',
  fontSize: '10px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  padding: '5px 12px',
  borderRadius: '4px',
  fontWeight: '500' as const,
};

const listingBody = {
  padding: '20px',
};

const listingBrokerage = {
  fontSize: '11px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  color: '#999999',
  margin: '0 0 6px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const listingAddress = {
  fontSize: '18px',
  fontWeight: '600' as const,
  color: '#1a1a1a',
  margin: '0 0 4px',
  fontFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
};

const listingAddressLink = {
  color: '#1a1a1a',
  textDecoration: 'none',
};

const listingPrice = {
  fontSize: '15px',
  fontWeight: '600' as const,
  color: '#1a1a1a',
  margin: '0 0 4px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const listingDetails = {
  fontSize: '13px',
  color: '#666666',
  margin: '0 0 12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const listingDescription = {
  fontSize: '13px',
  color: '#666666',
  lineHeight: '1.6',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const listingAgentRow = {
  marginTop: '16px',
  paddingTop: '14px',
  borderTop: '1px solid #f0f0f0',
};

const listingAgentPhoto = {
  borderRadius: '50%',
  objectFit: 'cover' as const,
  float: 'left' as const,
  marginRight: '12px',
};

const listingAgentName = {
  fontSize: '13px',
  fontWeight: '600' as const,
  color: '#1a1a1a',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const listingAgentMeta = {
  fontSize: '12px',
  color: '#999999',
  margin: '0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

// Pitch-preview placeholder styles (dashed borders, gray)
const placeholderHeader = {
  fontSize: '11px',
  fontWeight: '600' as const,
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  color: '#b45309',
  margin: '24px 0 12px',
  textAlign: 'center' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const placeholderCard = {
  border: '1.5px dashed #d4d4d4',
  borderRadius: '4px',
  marginBottom: '16px',
  backgroundColor: '#fafafa',
  overflow: 'hidden' as const,
};

const placeholderImage = {
  width: '100%',
  height: '180px',
  backgroundColor: '#efefed',
  display: 'flex',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  textAlign: 'center' as const,
};

const placeholderImageLabel = {
  fontSize: '12px',
  color: '#a3a3a3',
  fontWeight: '500' as const,
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as const,
  margin: '70px 0',
  textAlign: 'center' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const placeholderAddress = {
  fontSize: '18px',
  fontWeight: '600' as const,
  color: '#a3a3a3',
  margin: '8px 0 4px',
  fontFamily: "'Playfair Display', Georgia, serif",
};

const placeholderPrice = {
  fontSize: '16px',
  fontWeight: '600' as const,
  color: '#a3a3a3',
  margin: '0 0 4px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const placeholderDetails = {
  fontSize: '13px',
  color: '#a3a3a3',
  margin: '0 0 8px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const placeholderDescription = {
  fontSize: '13px',
  color: '#a3a3a3',
  fontStyle: 'italic' as const,
  margin: '0 0 12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const placeholderPhoto = {
  width: '44px',
  height: '44px',
  borderRadius: '50%',
  backgroundColor: '#efefed',
  border: '1.5px dashed #d4d4d4',
  float: 'left' as const,
  marginRight: '12px',
  textAlign: 'center' as const,
};

const placeholderPhotoLabel = {
  fontSize: '9px',
  color: '#a3a3a3',
  margin: '14px 0 0',
  textAlign: 'center' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const placeholderFootnote = {
  fontSize: '12px',
  color: '#78716c',
  fontStyle: 'italic' as const,
  textAlign: 'center' as const,
  margin: '8px 0 24px',
  padding: '0 16px',
  lineHeight: '1.5',
  fontFamily: 'Georgia, serif',
};

// Footer styles
const footerContainer = {
  marginTop: '24px',
  paddingBottom: '24px',
};

const footerDivider = {
  borderTop: '1px solid #e5e5e5',
  margin: '0 0 16px',
};

const footerLightDivider = {
  borderTop: '1px solid #f0f0f0',
  margin: '0 0 12px',
};

const forwardedText = {
  fontSize: '14px',
  color: '#666666',
  textAlign: 'center' as const,
  margin: '0 0 12px',
  lineHeight: '1.5',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const forwardedLink = {
  color: '#171717',
  fontWeight: 600 as const,
  textDecoration: 'underline',
};

const footerText = {
  fontSize: '13px',
  color: '#999999',
  textAlign: 'center' as const,
  margin: '0 0 8px',
  lineHeight: '1.5',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const footerLink = {
  color: '#666666',
  textDecoration: 'underline',
};

const footerCopyright = {
  fontSize: '12px',
  color: '#cccccc',
  textAlign: 'center' as const,
  margin: '16px 0 0',
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  fontFamily: 'system-ui, -apple-system, sans-serif',
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
