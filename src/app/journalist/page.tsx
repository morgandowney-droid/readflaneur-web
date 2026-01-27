import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { formatRelativeTime } from '@/lib/utils';

export const metadata = {
  title: 'Journalist Dashboard | Flâneur',
};

export default async function JournalistDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/journalist');
  }

  // Check if user is a journalist or admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, assigned_neighborhood_id')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'journalist' && profile?.role !== 'admin') {
    redirect('/journalist/apply');
  }

  // Fetch journalist's articles
  const { data: articles } = await supabase
    .from('articles')
    .select('*, neighborhood:neighborhoods(*)')
    .eq('author_id', user.id)
    .order('created_at', { ascending: false });

  const publishedArticles = articles?.filter((a) => a.status === 'published') || [];
  const draftArticles = articles?.filter((a) => a.status === 'draft') || [];
  const pendingArticles = articles?.filter((a) => a.status === 'pending') || [];

  return (
    <div className="py-12 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-light">Journalist Dashboard</h1>
          <Link
            href="/journalist/articles/new"
            className="bg-black text-white px-6 py-2 text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors"
          >
            Write New Article
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-6 border border-neutral-200">
            <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Published
            </p>
            <p className="text-3xl font-light">{publishedArticles.length}</p>
          </div>
          <div className="bg-white p-6 border border-neutral-200">
            <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Drafts
            </p>
            <p className="text-3xl font-light">{draftArticles.length}</p>
          </div>
          <div className="bg-white p-6 border border-neutral-200">
            <p className="text-xs tracking-widest uppercase text-neutral-400 mb-2">
              Pending Review
            </p>
            <p className="text-3xl font-light">{pendingArticles.length}</p>
          </div>
        </div>

        {/* Articles List */}
        <div>
          <h2 className="text-xs tracking-widest uppercase text-neutral-400 mb-4">
            Your Articles
          </h2>

          {!articles || articles.length === 0 ? (
            <div className="bg-white border border-neutral-200 p-12 text-center">
              <p className="text-neutral-600 mb-4">
                You haven&apos;t written any articles yet.
              </p>
              <Link
                href="/journalist/articles/new"
                className="inline-block bg-black text-white px-6 py-2 text-sm tracking-widest uppercase hover:bg-neutral-800 transition-colors"
              >
                Write Your First Article
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {articles.map((article) => (
                <Link
                  key={article.id}
                  href={`/journalist/articles/${article.id}`}
                  className="block bg-white border border-neutral-200 p-6 hover:border-neutral-400 transition-colors"
                >
                  <div className="flex items-start gap-6">
                    <img
                      src={article.image_url}
                      alt={article.headline}
                      className="w-24 h-16 object-cover"
                    />
                    <div className="flex-1">
                      <h3 className="font-medium">{article.headline}</h3>
                      <p className="text-sm text-neutral-400 mt-1">
                        {article.neighborhood?.name}, {article.neighborhood?.city}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-block px-3 py-1 text-xs tracking-widest uppercase ${
                          article.status === 'published'
                            ? 'bg-green-100 text-green-800'
                            : article.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {article.status}
                      </span>
                      <p className="text-sm text-neutral-400 mt-2">
                        {formatRelativeTime(article.created_at)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
