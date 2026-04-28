import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 px-4 text-gray-900">
      <div className="max-w-xl rounded-2xl bg-white p-8 text-center shadow">
        <h1 className="text-3xl font-bold mb-4 text-gray-900">
          AI Document Review Assistant
        </h1>

        <p className="text-gray-700 mb-6">
          A web-based system for uploading, reviewing, approving, and digitally
          signing documents.
        </p>

        <div className="flex justify-center gap-4">
          <Link
            href="/login"
            className="rounded-lg bg-black px-6 py-3 font-medium text-white hover:bg-gray-800"
          >
            Sign In
          </Link>

          <Link
            href="/dashboard"
            className="rounded-lg border border-gray-900 bg-white px-6 py-3 font-medium text-gray-900 hover:bg-gray-100"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}