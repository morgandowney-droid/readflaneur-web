import { EnrichedBriefDemo } from '@/components/feed/EnrichedNeighborhoodBrief';

export default function TestEnrichedBriefPage() {
  return (
    <div className="min-h-screen bg-neutral-100 py-8">
      <div className="max-w-xl mx-auto px-4">
        <h1 className="text-2xl font-light mb-6 text-center">
          Enriched Brief Preview
        </h1>
        <EnrichedBriefDemo />

        <div className="mt-8 text-center text-sm text-neutral-500">
          <p>Click &quot;View 6 verified sources&quot; to see the enriched view</p>
        </div>
      </div>
    </div>
  );
}
