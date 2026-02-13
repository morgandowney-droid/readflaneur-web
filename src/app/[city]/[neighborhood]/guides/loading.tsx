export default function GuidesLoading() {
  return (
    <div className="py-8 px-4">
      <div className="mx-auto max-w-5xl">
        {/* Header skeleton */}
        <div className="mb-8">
          <div className="mb-4">
            <div className="h-4 w-12 bg-elevated rounded" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="h-3 w-16 bg-elevated rounded mb-1" />
              <div className="h-6 w-32 bg-elevated rounded" />
            </div>
            <div className="flex gap-2">
              <div className="h-4 w-12 bg-elevated rounded" />
              <div className="h-4 w-14 bg-elevated rounded" />
              <div className="h-4 w-10 bg-elevated rounded" />
              <div className="h-4 w-10 bg-elevated rounded" />
            </div>
          </div>
        </div>

        {/* Filter tabs skeleton */}
        <div className="mb-6 space-y-3">
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-6 w-16 bg-elevated rounded" />
            ))}
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 w-20 bg-elevated rounded" />
            ))}
          </div>
        </div>

        {/* Listings grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="border border-border bg-surface overflow-hidden">
              <div className="h-32 bg-elevated" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-3/4 bg-elevated rounded" />
                <div className="h-3 w-1/2 bg-elevated rounded" />
                <div className="h-3 w-1/3 bg-elevated rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
