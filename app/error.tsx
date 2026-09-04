"use client";

// Catches unexpected server-component or rendering failures so users see a
// recoverable message instead of Next.js's bare production error screen.

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <main className="page-shell text-gray-900">
      <div className="page-container">
        <div className="section-card mx-auto mt-12 max-w-xl rounded-[2rem] p-8">
          <p className="eyebrow">Something went wrong</p>

          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">
            This page could not be loaded
          </h1>

          <p className="muted-copy mt-3 text-sm leading-6">
            The request failed before the page finished rendering. This is
            usually temporary — trying again often resolves it.
          </p>

          {error.digest && (
            <p className="mt-3 text-xs text-gray-500">
              Reference code: <code>{error.digest}</code>
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="button-primary"
            >
              Try again
            </button>

            <Link href="/dashboard" className="button-secondary">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
