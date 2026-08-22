import FormattedDate from "./FormattedDate";

export type TimelineEventType =
  | "created"
  | "uploaded"
  | "submitted"
  | "approved"
  | "rejected"
  | "signed";

export type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  title: string;
  by?: string;
  comment?: string | null;
  timestamp: string;
};

const TYPE_STYLES: Record<
  TimelineEventType,
  { dot: string; pill: string; label: string }
> = {
  created: {
    dot: "bg-gray-400",
    pill: "bg-gray-100 text-gray-700",
    label: "Created",
  },
  uploaded: {
    dot: "bg-blue-500",
    pill: "bg-blue-100 text-blue-800",
    label: "Uploaded",
  },
  submitted: {
    dot: "bg-amber-500",
    pill: "bg-amber-100 text-amber-800",
    label: "Submitted",
  },
  approved: {
    dot: "bg-green-500",
    pill: "bg-green-100 text-green-800",
    label: "Approved",
  },
  rejected: {
    dot: "bg-red-500",
    pill: "bg-red-100 text-red-800",
    label: "Rejected",
  },
  signed: {
    dot: "bg-teal-500",
    pill: "bg-teal-100 text-teal-800",
    label: "Signed",
  },
};

export default function DocumentTimeline({
  events,
}: {
  events: TimelineEvent[];
}) {
  return (
    <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Document Timeline</h2>
        <span className="text-xs uppercase tracking-[0.18em] text-gray-400">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </div>

      <p className="mt-2 text-sm text-gray-600">
        A visual history of this document&apos;s lifecycle.
      </p>

      {events.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-gray-200 p-4 text-sm text-gray-600">
          No events yet.
        </p>
      ) : (
        <ol className="mt-6">
          {events.map((event, index) => {
            const style = TYPE_STYLES[event.type];
            const isLast = index === events.length - 1;

            return (
              <li key={event.id} className="relative pb-6 pl-10 last:pb-0">
                {!isLast && (
                  <span
                    aria-hidden
                    className="absolute left-[14px] top-4 bottom-0 w-0.5 bg-gray-200"
                  />
                )}

                <span
                  aria-hidden
                  className={`absolute left-2 top-1.5 h-4 w-4 rounded-full ring-4 ring-white ${style.dot}`}
                />

                <div className="rounded-2xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.pill}`}
                    >
                      {style.label}
                    </span>

                    <p className="text-base font-semibold text-gray-900">
                      {event.title}
                    </p>
                  </div>

                  <p className="mt-1 text-xs text-gray-500">
                    <FormattedDate value={event.timestamp} />
                    {event.by && (
                      <>
                        {" - "}
                        <span className="font-medium text-gray-700">
                          {event.by}
                        </span>
                      </>
                    )}
                  </p>

                  {event.comment && (
                    <p className="mt-3 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm leading-6 text-gray-700">
                      {event.comment}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
