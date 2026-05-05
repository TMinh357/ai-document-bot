import Link from "next/link";
import { ReactNode } from "react";
import LogoutButton from "@/components/LogoutButton";

type AppShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export default function AppShell({
  title,
  description,
  children,
}: AppShellProps) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-teal-50 via-stone-50 to-orange-50 text-gray-900">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-teal-700">
              Workspace Overview
            </p>

            <h1 className="mt-2 text-4xl font-bold tracking-tight text-gray-950">
              {title}
            </h1>

            {description && (
              <p className="mt-2 text-gray-600">{description}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/documents"
              className="rounded-full border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50"
            >
              Documents
            </Link>

            <Link
              href="/reviews"
              className="rounded-full border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50"
            >
              Reviews
            </Link>

            <LogoutButton />
          </div>
        </header>

        {children}
      </div>
    </main>
  );
}