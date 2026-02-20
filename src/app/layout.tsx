import type { Metadata } from 'next';
import { Inter, Cormorant_Garamond, Merriweather } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { PersonaSwitcher } from '@/components/admin/PersonaSwitcher';
import { NeighborhoodModalProvider } from '@/components/neighborhoods/NeighborhoodSelectorModal';
import { LocationPrompt } from '@/components/location/LocationPrompt';
import { ReturnVisitPrompt } from '@/components/feed/ReturnVisitPrompt';
import { PrimaryChangeSuggestion } from '@/components/feed/PrimaryChangeSuggestion';
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
        {/* Sync neighborhood cookie + redirect returning users to feed before React hydration */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var k="flaneur-neighborhood-preferences",c="flaneur-neighborhoods",s=localStorage.getItem(k);if(s){var ids=JSON.parse(s);if(Array.isArray(ids)&&ids.length>0){document.cookie=c+"="+ids.join(",")+";path=/;max-age=31536000;SameSite=Strict";if(location.pathname==="/")window.location.replace("/feed")}}else{var m=document.cookie.match(new RegExp("(?:^|; )"+c+"=([^;]*)"));if(m&&m[1]){var ci=m[1].split(",").filter(Boolean);if(ci.length>0){localStorage.setItem(k,JSON.stringify(ci));if(location.pathname==="/")window.location.replace("/feed")}}else{document.cookie=c+"=;path=/;max-age=0;SameSite=Strict"}}}catch(e){}})()` }} />
        <LanguageProvider>
          <NeighborhoodModalProvider>
            <Header />
            <main>{children}</main>
            <Footer />
            <PersonaSwitcher />
            <LocationPrompt />
            <ReturnVisitPrompt />
            <PrimaryChangeSuggestion />
          </NeighborhoodModalProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
