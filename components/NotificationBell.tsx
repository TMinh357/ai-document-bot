"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  document_id: string | null;
  is_read: boolean;
  created_at: string;
};

const TYPE_DOT: Record<string, string> = {
  review_assigned: "bg-blue-500",
  review_progress: "bg-teal-500",
  review_overdue: "bg-red-500",
  document_approved: "bg-green-500",
  document_rejected: "bg-red-500",
  account_approved: "bg-green-500",
  account_rejected: "bg-red-500",
};

const RECENT_LIMIT = 8;

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationBell() {
  const supabase = createClient();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setLoaded(true);
        return;
      }
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, message, document_id, is_read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT);
      if (cancelled) return;
      setItems((data ?? []) as Notification[]);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!open) return;

    function onMouseDown(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unreadCount = items.filter((n) => !n.is_read).length;

  async function markAllRead() {
    const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id);
    if (!unreadIds.length) return;
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .in("id", unreadIds);
  }

  async function handleItemClick(n: Notification) {
    if (!n.is_read) {
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      );
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", n.id);
    }
    setOpen(false);
    if (n.document_id) {
      router.push(`/documents/${n.document_id}`);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-strong)] text-gray-700 shadow-sm hover:border-teal-600/30 hover:bg-white hover:text-teal-700"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 4.5 1.5 6 2.5 7H3.5C4.5 14 6 12.5 6 8z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>

        {loaded && unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[18px] text-white shadow ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-3 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-lg)]"
        >
          <div className="flex items-center justify-between border-b border-gray-200/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-semibold text-teal-700 hover:text-teal-900"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {!loaded ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500">
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-600">
                No notifications yet.
              </div>
            ) : (
              <ul className="divide-y divide-gray-200/70">
                {items.map((n) => {
                  const dot = TYPE_DOT[n.type] ?? "bg-gray-400";
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => handleItemClick(n)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-teal-50/60 ${
                          n.is_read ? "" : "bg-teal-50/30"
                        }`}
                      >
                        <span
                          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-sm text-gray-900 ${
                              n.is_read ? "font-normal" : "font-semibold"
                            }`}
                          >
                            {n.title}
                          </span>
                          {n.message && (
                            <span className="muted-copy mt-0.5 block text-xs leading-5 line-clamp-2">
                              {n.message}
                            </span>
                          )}
                          <span className="mt-1 block text-[11px] text-gray-400">
                            {formatRelative(n.created_at)}
                          </span>
                        </span>
                        {!n.is_read && (
                          <span
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal-600"
                            aria-label="Unread"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-200/70 bg-gray-50/60 px-4 py-2.5 text-center">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-teal-700 hover:text-teal-900"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
