import type { Metadata } from 'next';
import { Inter, Cormorant_Garamond, Merriweather } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { PersonaSwitcher } from '@/components/admin/PersonaSwitcher';
import { NeighborhoodModalProvider } from '@/components/neighborhoods/NeighborhoodSelectorModal';
import { LocationPrompt } from '@/components/location/LocationPrompt';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-cormorant',
});

const merriweather = Merriweather({
  subsets: ['latin'],
  weight: ['300', '400', '700'],
  variable: '--font-merriweather',
});

export const metadata: Metadata = {
  title: 'Flâneur | Hyper-local stories',
  description:
    'Discover hyper-local stories from the neighborhoods you love. West Village, Notting Hill, Paddington, and more.',
  openGraph: {
    title: 'Flâneur | Hyper-local stories',
    description: 'Discover hyper-local stories from the neighborhoods you love.',
    type: 'website',
  },
  // Prevent AI training on our content
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  other: {
    // Additional AI scraper prevention
    'X-Robots-Tag': 'noai, noimageai',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${cormorant.variable} ${merriweather.variable} font-sans antialiased bg-canvas text-neutral-200`}>
        {/* Inline redirect: returning users go straight to feed before React hydration */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(location.pathname!=="/")return;var s=localStorage.getItem("flaneur-neighborhood-preferences");if(!s)return;var ids=JSON.parse(s);if(Array.isArray(ids)&&ids.length>0){window.location.replace("/feed?neighborhoods="+ids.join(","))}}catch(e){}})()` }} />
        <NeighborhoodModalProvider>
          <Header />
          <main>{children}</main>
          <Footer />
          <PersonaSwitcher />
          <LocationPrompt />
        </NeighborhoodModalProvider>
      </body>
    </html>
  );
}
