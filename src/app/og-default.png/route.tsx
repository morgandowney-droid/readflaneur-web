import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#050505',
          background: 'radial-gradient(ellipse at top, #1e1e1e, #050505 70%)',
        }}
      >
        <div
          style={{
            fontSize: 80,
            fontWeight: 300,
            color: '#e5e5e5',
            letterSpacing: '0.3em',
            marginBottom: 24,
          }}
        >
          FLANEUR
        </div>
        <div
          style={{
            fontSize: 24,
            color: '#a3a3a3',
            letterSpacing: '0.5em',
            textTransform: 'uppercase',
            marginBottom: 48,
          }}
        >
          Local stories, interesting neighborhoods
        </div>
        <div
          style={{
            width: 48,
            height: 1,
            backgroundColor: '#525252',
          }}
        />
        <div
          style={{
            fontSize: 18,
            color: '#737373',
            marginTop: 48,
            letterSpacing: '0.2em',
          }}
        >
          270+ NEIGHBORHOODS  ·  91 CITIES  ·  DELIVERED DAILY
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
