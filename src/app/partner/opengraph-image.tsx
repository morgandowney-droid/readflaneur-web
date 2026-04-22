import { ImageResponse } from 'next/og';

// Dedicated OG image for /partner. Shown when the partner URL is shared on
// iMessage, Slack, WhatsApp, LinkedIn, X, etc. Next.js automatically wires
// this to /partner/opengraph-image and references it as og:image for the page.

export const runtime = 'edge';
export const alt = 'Flaneur Partner Program - One broker per neighborhood';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function PartnerOGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#fdfcfa',
          color: '#1c1917',
          fontFamily: 'Georgia, serif',
          padding: '72px 80px',
          position: 'relative',
        }}
      >
        {/* Top masthead bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #d9d2c6',
            paddingBottom: '20px',
            marginBottom: '48px',
          }}
        >
          <div
            style={{
              fontSize: '36px',
              letterSpacing: '0.28em',
              color: '#1c1917',
            }}
          >
            FL&Acirc;NEUR
          </div>
          <div
            style={{
              fontSize: '14px',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#78716c',
            }}
          >
            The Morning Brief, Branded.
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: '72px',
            fontWeight: 400,
            lineHeight: 1.08,
            letterSpacing: '-0.01em',
            marginBottom: '28px',
            maxWidth: '920px',
            color: '#1c1917',
            display: 'flex',
          }}
        >
          One Broker. One Neighborhood. One Morning.
        </div>

        {/* Subhead */}
        <div
          style={{
            fontSize: '26px',
            lineHeight: 1.45,
            color: '#44403c',
            maxWidth: '900px',
            marginBottom: '48px',
            display: 'flex',
          }}
        >
          Your clients read about their neighborhood every morning, with your name at the top. Exclusive to one luxury real estate broker per neighborhood, worldwide.
        </div>

        {/* Stats row */}
        <div
          style={{
            display: 'flex',
            gap: '56px',
            marginTop: 'auto',
            paddingTop: '32px',
            borderTop: '1px solid #d9d2c6',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '46px', color: '#92400e', letterSpacing: '-0.01em' }}>270</div>
            <div style={{ fontSize: '13px', color: '#78716c', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: '4px' }}>Neighborhoods</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '46px', color: '#92400e', letterSpacing: '-0.01em' }}>42</div>
            <div style={{ fontSize: '13px', color: '#78716c', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: '4px' }}>Countries</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '46px', color: '#92400e', letterSpacing: '-0.01em' }}>7 AM</div>
            <div style={{ fontSize: '13px', color: '#78716c', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: '4px' }}>Local time daily</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ fontSize: '15px', color: '#1c1917', letterSpacing: '0.14em', textTransform: 'uppercase' }}>readflaneur.com/partner</div>
            <div style={{ fontSize: '13px', color: '#78716c', marginTop: '6px' }}>14-day free trial</div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
