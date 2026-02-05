import Link from 'next/link';

const adminPages = [
  { href: '/admin/articles', title: 'Articles', description: 'Review and manage articles' },
  { href: '/admin/news-feed', title: 'News Feed QC', description: 'Quality control for all content' },
  { href: '/admin/regenerate-images', title: 'Regenerate Images', description: 'Generate AI images for articles' },
  { href: '/admin/news-coverage', title: 'News Coverage', description: 'Monitor RSS feeds and coverage' },
  { href: '/admin/guides/michelin', title: 'Michelin Ratings', description: 'Manage Michelin designations' },
  { href: '/admin/guides/add-place', title: 'Add Place', description: 'Manually add guide listings' },
  { href: '/admin/ads', title: 'Ads', description: 'Review and approve ads' },
  { href: '/admin/journalists', title: 'Journalists', description: 'Manage journalist applications' },
  { href: '/admin/tips', title: 'Tips', description: 'Review submitted tips' },
  { href: '/admin/analytics', title: 'Analytics', description: 'View site analytics' },
  { href: '/admin/newsletter', title: 'Newsletter', description: 'Manage newsletter subscribers' },
  { href: '/admin/sections', title: 'Sections', description: 'Manage content sections' },
];

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-neutral-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-neutral-600 mb-8">Manage your Flâneur platform</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {adminPages.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="block p-6 bg-white border border-neutral-200 rounded-lg hover:border-neutral-400 hover:shadow-sm transition-all"
            >
              <h2 className="text-lg font-semibold mb-1">{page.title}</h2>
              <p className="text-sm text-neutral-500">{page.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
