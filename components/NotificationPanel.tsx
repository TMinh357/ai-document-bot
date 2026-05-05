"use client";

import { useState } from "react";
import Link from "next/link";
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

const TYPE_CONFIG: Record<string, { dot: string; label: string }> = {
  review_assigned: { dot: "bg-blue-500", label: "Review" },
  document_approved: { dot: "bg-green-500", label: "Approved" },
  document_rejected: { dot: "bg-red-500", label: "Rejected" },
};

export default function NotificationPanel({
  initial,
}: {
  initial: Notification[];
}) {
  const supabase = createClient();
  const [notifications, setNotifications] = useState(initial);

  async function toggleRead(id: string, current: boolean) {
    const next = !current;
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: next } : n))
    );
    await supabase
      .from("notifications")
      .update({ is_read: next })
      .eq("id", id);
  }

  async function markAllRead() {
    const unreadIds = notifications
      .filter((n) => !n.is_read)
      .map((n) => n.id);
    if (!unreadIds.length) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .in("id", unreadIds);
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="section-card overflow-hidden rounded-[2rem]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/70 px-6 py-5">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Notifications
          </h2>
          {unreadCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-teal-600 px-2.5 py-0.5 text-xs font-bold text-white">
              {unreadCount} new
            </span>
          )}
        </div>

        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-sm font-semibold text-teal-700 hover:text-teal-900"
          >
            Mark all as read
          </button>
        )}
      </div>

      <div className="data-list">
        {notifications.length > 0 ? (
          notifications.map((n) => {
            const config = TYPE_CONFIG[n.type] ?? {
              dot: "bg-gray-400",
              label: "Notice",
            };

            return (
              <div
                key={n.id}
                className={`flex items-start gap-4 px-6 py-4 ${n.is_read ? "opacity-60" : ""}`}
              >
                <div
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${config.dot}`}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className={`text-sm text-gray-900 ${n.is_read ? "font-normal" : "font-semibold"}`}
                      >
                        {n.title}
                      </p>

                      {n.message && (
                        <p className="muted-copy mt-1 text-sm leading-5">
                          {n.message}
                        </p>
                      )}

                      <p className="mt-1 text-xs text-gray-400">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {n.document_id && (
                        <Link
                          href={`/documents/${n.document_id}`}
                          className="button-secondary py-1 px-3 text-xs"
                        >
                          View
                        </Link>
                      )}

                      <button
                        onClick={() => toggleRead(n.id, n.is_read)}
                        className="text-xs font-medium text-gray-500 hover:text-teal-700"
                      >
                        {n.is_read ? "Mark unread" : "Mark read"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="px-6 py-10 text-center text-gray-600">
            No notifications yet.
          </div>
        )}
      </div>
    </div>
  );
}
