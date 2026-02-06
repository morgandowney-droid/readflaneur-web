import type { Metadata } from 'next';
import { Inter, Cormorant_Garamond } from 'next/font/google';
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
      <body className={`${inter.variable} ${cormorant.variable} font-sans antialiased bg-neutral-50`}>
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
