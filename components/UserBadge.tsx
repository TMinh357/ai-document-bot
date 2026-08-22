import { formatRoleLabel } from "@/lib/role-labels";

type UserBadgeProps = {
  fullName: string | null | undefined;
  email: string | null | undefined;
  role: string;
};

export default function UserBadge({ fullName, email, role }: UserBadgeProps) {
  const displayName =
    (fullName && fullName.trim()) ||
    (email ? email.split("@")[0] : "Account");

  return (
    <div className="hidden items-center gap-3 rounded-full border border-[var(--border-strong)] bg-[var(--surface-strong)] px-4 py-2 shadow-sm sm:inline-flex">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold uppercase text-white">
        {displayName.slice(0, 2)}
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-gray-900">{displayName}</p>
        <p className="text-[11px] text-gray-500">
          {email ?? ""}
          {email && " - "}
          <span className="font-medium uppercase tracking-wide text-teal-700">
            {formatRoleLabel(role)}
          </span>
        </p>
      </div>
    </div>
  );
}
