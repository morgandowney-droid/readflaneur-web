import { createClient } from '@/lib/supabase/server';
import { Neighborhood } from '@/types';
import { EnhancedNeighborhoodSelector } from '@/components/neighborhoods/EnhancedNeighborhoodSelector';

export const metadata = {
  title: 'Neighborhoods | Flâneur',
  description: 'Browse and select from 91 neighborhoods across 23 global cities. Personalize your Flâneur feed with local stories from the places you love.',
};

export default async function NeighborhoodsPage() {
  const supabase = await createClient();

  // Fetch all neighborhoods
  const { data: neighborhoods } = await supabase
    .from('neighborhoods')
    .select('*')
    .order('city', { ascending: true });

  // Fetch article counts per neighborhood
  const { data: articleCountsRaw } = await supabase
    .from('articles')
    .select('neighborhood_id')
    .eq('status', 'published');

  // Aggregate article counts
  const articleCounts: Record<string, number> = {};
  if (articleCountsRaw) {
    articleCountsRaw.forEach(article => {
      if (article.neighborhood_id) {
        articleCounts[article.neighborhood_id] = (articleCounts[article.neighborhood_id] || 0) + 1;
      }
    });
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <EnhancedNeighborhoodSelector
          neighborhoods={(neighborhoods || []) as Neighborhood[]}
          articleCounts={articleCounts}
          mode="page"
        />
      </div>
    </div>
  );
}
