import type { Metadata } from 'next';
import { Inter, Cormorant_Garamond, Merriweather } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { PersonaSwitcher } from '@/components/admin/PersonaSwitcher';
import { NeighborhoodModalProvider } from '@/components/neighborhoods/NeighborhoodSelectorModal';
import { LocationPrompt } from '@/components/location/LocationPrompt';
import { ReturnVisitPrompt } from '@/components/feed/ReturnVisitPrompt';
import { LanguageProvider } from '@/components/providers/LanguageProvider';

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
      <body className={`${inter.variable} ${cormorant.variable} ${merriweather.variable} font-sans antialiased bg-canvas text-fg`}>
        {/* Inline theme + language: set before first paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem("flaneur-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}var l=localStorage.getItem("flaneur-language");if(l&&l!=="en"){document.documentElement.lang=l}}catch(e){}})()` }} />
        {/* Inline redirect: returning users go straight to feed before React hydration */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(location.pathname!=="/")return;var s=localStorage.getItem("flaneur-neighborhood-preferences");if(!s)return;var ids=JSON.parse(s);if(Array.isArray(ids)&&ids.length>0){window.location.replace("/feed?neighborhoods="+ids.join(","))}}catch(e){}})()` }} />
        <LanguageProvider>
          <NeighborhoodModalProvider>
            <Header />
            <main>{children}</main>
            <Footer />
            <PersonaSwitcher />
            <LocationPrompt />
            <ReturnVisitPrompt />
          </NeighborhoodModalProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
