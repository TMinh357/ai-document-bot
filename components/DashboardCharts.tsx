type StatusCounts = {
  draft: number;
  pending: number;
  approved: number;
  rejected: number;
};

type MonthBucket = {
  label: string;
  count: number;
};

type ApprovalRatio = {
  approved: number;
  rejected: number;
  pending: number;
};

type DashboardChartsProps = {
  statusCounts: StatusCounts;
  monthlyCounts: MonthBucket[];
  approvalRatio: ApprovalRatio | null;
};

const STATUS_BAR_COLORS: Record<keyof StatusCounts, string> = {
  draft: "bg-gray-400",
  pending: "bg-amber-500",
  approved: "bg-green-500",
  rejected: "bg-red-500",
};

const STATUS_ORDER: (keyof StatusCounts)[] = [
  "draft",
  "pending",
  "approved",
  "rejected",
];

export default function DashboardCharts({
  statusCounts,
  monthlyCounts,
  approvalRatio,
}: DashboardChartsProps) {
  const totalDocs = STATUS_ORDER.reduce((sum, s) => sum + statusCounts[s], 0);
  const maxMonth = Math.max(...monthlyCounts.map((m) => m.count), 1);

  const totalDecided = approvalRatio
    ? approvalRatio.approved + approvalRatio.rejected
    : 0;
  const approvedPct =
    totalDecided > 0 ? (approvalRatio!.approved / totalDecided) * 100 : 0;
  const rejectedPct =
    totalDecided > 0 ? (approvalRatio!.rejected / totalDecided) * 100 : 0;

  return (
    <section className="mt-6 grid gap-6 lg:grid-cols-2">
      <div className="section-card rounded-[1.75rem] p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Documents by Status
          </h2>
          <span className="text-xs font-medium text-gray-600">
            {totalDocs} total
          </span>
        </div>

        {totalDocs === 0 ? (
          <p className="mt-6 text-sm text-gray-500">No documents yet.</p>
        ) : (
          <div className="mt-6 space-y-4">
            {STATUS_ORDER.map((status) => {
              const count = statusCounts[status];
              const pct = totalDocs > 0 ? (count / totalDocs) * 100 : 0;

              return (
                <div key={status}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium capitalize text-gray-700">
                      {status}
                    </span>
                    <span className="text-gray-600">
                      {count}
                      <span className="ml-2 text-xs text-gray-500">
                        ({pct.toFixed(0)}%)
                      </span>
                    </span>
                  </div>

                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full ${STATUS_BAR_COLORS[status]} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="section-card rounded-[1.75rem] p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Documents by Month
          </h2>
          <span className="text-xs font-medium text-gray-600">
            Last 6 months
          </span>
        </div>

        {/* Fixed-pixel plot area: bar height is computed directly from the
            count against PLOT_HEIGHT, so scaling is exact and does not depend
            on a percentage-of-flex-parent chain (which collapses inside
            align-items:end). A 12-doc bar is exactly 3x a 4-doc bar. */}
        <div className="mt-6 flex items-end gap-3 border-b border-gray-200 pb-px">
          {monthlyCounts.map((m) => {
            const PLOT_HEIGHT = 160; // px - the tallest bar fills this
            const barHeight =
              m.count > 0
                ? Math.max((m.count / maxMonth) * PLOT_HEIGHT, 8)
                : 0;
            return (
              <div
                key={m.label}
                className="flex flex-1 flex-col items-center gap-2"
              >
                {/* Track: a faint full-height rail so empty months read as
                    "0 this month" rather than looking like a broken chart. */}
                <div
                  className="relative flex w-full items-end justify-center rounded-t-xl bg-gray-100/70"
                  style={{ height: `${PLOT_HEIGHT}px` }}
                >
                  <span
                    className={`absolute -top-5 text-xs font-semibold ${
                      m.count > 0 ? "text-gray-700" : "text-gray-400"
                    }`}
                  >
                    {m.count}
                  </span>
                  <div
                    className="w-full rounded-t-xl bg-gradient-to-t from-teal-600 to-teal-400 transition-all"
                    style={{ height: `${barHeight}px` }}
                  />
                </div>
                <span className="text-xs text-gray-600">{m.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {approvalRatio && (
        <div className="section-card rounded-[1.75rem] p-6 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Approval / Rejection Ratio
            </h2>
            <span className="text-xs font-medium text-gray-600">
              {totalDecided} completed decisions
              {approvalRatio.pending > 0 &&
                ` - ${approvalRatio.pending} pending approvals`}
            </span>
          </div>

          {totalDecided === 0 ? (
            <p className="mt-6 text-sm text-gray-500">
              No review decisions yet.
            </p>
          ) : (
            <>
              <div className="mt-6 flex h-4 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="bg-green-500 transition-all"
                  style={{ width: `${approvedPct}%` }}
                />
                <div
                  className="bg-red-500 transition-all"
                  style={{ width: `${rejectedPct}%` }}
                />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white"
                    >
                      OK
                    </span>
                    <p className="text-sm font-semibold text-green-900">
                      Approved
                    </p>
                  </div>
                  <p className="mt-2 text-3xl font-bold text-green-900">
                    {approvalRatio.approved}
                  </p>
                  <p className="text-xs text-green-700">
                    {approvedPct.toFixed(0)}% of completed decisions
                  </p>
                </div>

                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white"
                    >
                      !
                    </span>
                    <p className="text-sm font-semibold text-red-900">
                      Rejected
                    </p>
                  </div>
                  <p className="mt-2 text-3xl font-bold text-red-900">
                    {approvalRatio.rejected}
                  </p>
                  <p className="text-xs text-red-700">
                    {rejectedPct.toFixed(0)}% of completed decisions
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
