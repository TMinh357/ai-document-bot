// Shown while the document detail page runs its queries and signs storage
// URLs, so navigation gives immediate feedback instead of a frozen page.
export default function Loading() {
  return (
    <main className="page-shell text-gray-900">
      <div className="page-container">
        <div className="animate-pulse">
          <div className="h-3 w-32 rounded bg-gray-200" />
          <div className="mt-4 h-9 w-72 max-w-full rounded bg-gray-200" />
          <div className="mt-3 h-4 w-96 max-w-full rounded bg-gray-100" />

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="section-card h-28 rounded-[1.75rem] bg-gray-50"
              />
            ))}
          </div>

          <div className="section-card mt-6 h-64 rounded-[2rem] bg-gray-50" />
          <div className="section-card mt-6 h-96 rounded-[2rem] bg-gray-50" />
        </div>

        <p className="sr-only" role="status" aria-live="polite">
          Loading document…
        </p>
      </div>
    </main>
  );
}
