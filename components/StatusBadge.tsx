type StatusBadgeProps = {
  status: string | null | undefined;
};

const statusStyles: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  signed: "bg-purple-50 text-purple-700 border-purple-200",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const displayStatus = status || "unknown";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
        statusStyles[displayStatus] ||
        "bg-gray-100 text-gray-700 border-gray-200"
      }`}
    >
      {displayStatus}
    </span>
  );
}