import { redirect } from 'next/navigation';

interface MarketPageProps {
  params: Promise<{ city: string; neighborhood: string }>;
}

export default async function MarketPage({ params }: MarketPageProps) {
  const { city, neighborhood } = await params;
  redirect(`/${city}/${neighborhood}/property-watch`);
}
