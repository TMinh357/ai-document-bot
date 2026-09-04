// The dashboard fans out several aggregate queries; show a skeleton rather
// than leaving the previous page on screen while they run.
export default function Loading() {
  return (
    <main className="page-shell text-gray-900">
      <div className="page-container">
        <div className="animate-pulse">
          <div className="h-3 w-40 rounded bg-gray-200" />
          <div className="mt-4 h-10 w-64 max-w-full rounded bg-gray-200" />
          <div className="mt-3 h-4 w-full max-w-2xl rounded bg-gray-100" />

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="section-card h-32 rounded-[1.75rem] bg-gray-50"
              />
            ))}
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="section-card h-64 rounded-[2rem] bg-gray-50"
              />
            ))}
          </div>
        </div>

        <p className="sr-only" role="status" aria-live="polite">
          Loading dashboard…
        </p>
      </div>
    </main>
  );
}
