import LogoutButton from "@/components/LogoutButton";
import NotificationBell from "@/components/NotificationBell";
import UserBadge from "@/components/UserBadge";
import ActiveLink from "@/components/ActiveLink";
import FormattedDate from "@/components/FormattedDate";
import EmptyState from "@/components/EmptyState";
import DeviceRequestDecision from "@/components/admin/DeviceRequestDecision";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/auth";

type RequestRow = {
  id: string;
  user_id: string;
  pairing_code: string;
  status: string;
  approval_method: string | null;
  expires_at: string;
  approved_expires_at: string | null;
  requested_ip: string | null;
  requested_agent: string | null;
  created_at: string;
};

export default async function AdminDeviceRequestsPage() {
  const { user, profile, role } = await requireRole(["admin"]);
  const admin = createAdminClient();

  const { data: requests } = await admin
    .from("device_approval_requests")
    .select(
      "id, user_id, pairing_code, status, approval_method, expires_at, approved_expires_at, requested_ip, requested_agent, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (requests ?? []) as RequestRow[];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, full_name, role").in("id", userIds)
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const now = Date.now();
  const pending = rows.filter(
    (r) => r.status === "pending" && new Date(r.expires_at).getTime() > now
  );
  const handled = rows.filter((r) => !pending.includes(r));

  return (
    <main className="page-shell">
      <div className="page-container">
        <div className="topbar mb-8">
          <div>
            <p className="eyebrow">Administration</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">
              Signing Device Requests
            </h1>
            <p className="muted-copy mt-2">
              Approve a replacement signing key only after confirming the
              person&apos;s identity outside this system.
            </p>
          </div>

          <div className="topbar-nav">
            <ActiveLink href="/admin" className="button-secondary">
              Admin Panel
            </ActiveLink>
            <UserBadge
              fullName={profile?.full_name}
              email={user.email}
              role={role}
            />
            <NotificationBell />
            <LogoutButton />
          </div>
        </div>

        <div className="section-card mb-6 rounded-[2rem] border-l-4 border-l-amber-400 p-6">
          <h2 className="text-base font-semibold text-gray-900">
            Why this needs a human
          </h2>
          <p className="muted-copy mt-2 text-sm leading-6">
            A signing key proves who approved a document. If a password alone
            could replace one, then anyone who learned a password could sign in
            someone else&apos;s name. Normally a user approves a new device by
            signing with a device they already hold. This page exists for the
            case where every previous device is gone — so approving here means
            vouching that you have confirmed, by some means outside this system,
            that the person asking really is who they claim to be.
          </p>
        </div>

        <section className="section-card overflow-hidden rounded-[2rem]">
          <div className="border-b border-gray-200/70 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-900">
              Awaiting decision{" "}
              <span className="muted-copy text-sm font-normal">
                ({pending.length})
              </span>
            </h2>
          </div>

          <div className="data-list">
            {pending.length === 0 ? (
              <div className="px-6 py-10">
                <EmptyState
                  title="Nothing waiting"
                  description="No user is currently asking to register a signing key on a new device."
                />
              </div>
            ) : (
              pending.map((req) => {
                const p = profileMap.get(req.user_id);
                return (
                  <div key={req.id} className="px-6 py-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {(p?.full_name as string | null) ?? req.user_id}
                        </h3>

                        <p className="mt-1 font-mono text-2xl font-bold tracking-[0.3em] text-teal-800">
                          {req.pairing_code}
                        </p>

                        <dl className="mt-3 space-y-1 text-xs text-gray-600">
                          <div className="flex gap-2">
                            <dt className="font-semibold">Requested:</dt>
                            <dd>
                              <FormattedDate value={req.created_at} />
                            </dd>
                          </div>
                          {req.requested_ip && (
                            <div className="flex gap-2">
                              <dt className="font-semibold">IP:</dt>
                              <dd>{req.requested_ip}</dd>
                            </div>
                          )}
                          {req.requested_agent && (
                            <div className="flex gap-2">
                              <dt className="font-semibold">Browser:</dt>
                              <dd className="truncate">{req.requested_agent}</dd>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <dt className="font-semibold">Lapses:</dt>
                            <dd>
                              <FormattedDate value={req.expires_at} />
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <DeviceRequestDecision
                        requestId={req.id}
                        userName={
                          (p?.full_name as string | null) ?? "this user"
                        }
                        pairingCode={req.pairing_code}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {handled.length > 0 && (
          <section className="section-card mt-6 overflow-hidden rounded-[2rem]">
            <div className="border-b border-gray-200/70 px-6 py-5">
              <h2 className="text-lg font-semibold text-gray-900">History</h2>
            </div>

            <div className="data-list">
              {handled.map((req) => {
                const p = profileMap.get(req.user_id);
                return (
                  <div
                    key={req.id}
                    className="flex flex-col gap-2 px-6 py-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {(p?.full_name as string | null) ?? req.user_id}
                        <span className="muted-copy ml-2 font-mono text-xs">
                          {req.pairing_code}
                        </span>
                      </p>
                      <p className="muted-copy mt-1 text-xs">
                        <FormattedDate value={req.created_at} />
                        {req.approval_method
                          ? ` · approved via ${
                              req.approval_method === "admin"
                                ? "administrator"
                                : "existing key"
                            }`
                          : ""}
                      </p>
                    </div>

                    <span
                      className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${
                        req.status === "used"
                          ? "bg-teal-100 text-teal-800"
                          : req.status === "approved"
                            ? "bg-blue-100 text-blue-800"
                            : req.status === "rejected"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
