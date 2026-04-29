import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell flex items-center">
      <div className="page-container">
        <section className="hero-panel overflow-hidden rounded-[2rem] px-6 py-10 md:px-10 md:py-14">
          <div className="grid gap-10 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div className="max-w-3xl">
              <p className="eyebrow">Document Intelligence</p>
              <h1 className="mt-4 text-5xl font-semibold tracking-tight text-gray-900 md:text-6xl">
                A smarter way to upload, review, and approve documents.
              </h1>

              <p className="muted-copy mt-6 max-w-2xl text-lg leading-8">
                Upload documents, assign reviewers, track approvals, and keep a 
                clear audit trail in one structured workspace.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <Link href="/login" className="button-primary">
                  Open Workspace
                </Link>

                <Link href="/dashboard" className="button-secondary">
                  View Dashboard
                </Link>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="metric-card rounded-[1.75rem] p-6">
                <p className="eyebrow">System highlights</p>
                <ul className="mt-4 space-y-3 text-base leading-7 text-gray-700">
                  <li>Secure PDF upload with Supabase Storage.</li>
                  <li>Role-based review workflow for employees and reviewers.</li>
                  <li>Approval history and audit logs for document tracking.</li>
                </ul>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="metric-card rounded-[1.5rem] p-5">
                  <p className="text-sm font-medium text-gray-600">Review state</p>
                  <p className="mt-2 text-3xl font-semibold text-gray-900">
                    Live
                  </p>
                </div>

                <div className="metric-card rounded-[1.5rem] p-5">
                  <p className="text-sm font-medium text-gray-600">
                    Audit visibility
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-gray-900">
                    Clear
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
