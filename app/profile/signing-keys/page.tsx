import LogoutButton from "@/components/LogoutButton";
import NotificationBell from "@/components/NotificationBell";
import UserBadge from "@/components/UserBadge";
import ActiveLink from "@/components/ActiveLink";
import SigningKeyList, { type KeyRow } from "@/components/SigningKeyList";
import { requireUser } from "@/lib/supabase/auth";
import { aaguidToName } from "@/lib/webauthn/aaguid-registry";
import { getRpId } from "@/lib/webauthn/config";

export default async function SigningKeysPage() {
  const { supabase, user, profile, role } = await requireUser();

  const { data: credentials } = await supabase
    .from("webauthn_credentials")
    .select(
      "id, device_label, device_type, aaguid, created_at, last_used_at, revoked_at, revoked_reason"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const keys: KeyRow[] = (credentials ?? []).map((c) => ({
    id: c.id as string,
    device_label: c.device_label as string | null,
    device_type: c.device_type as string | null,
    aaguid: c.aaguid as string | null,
    created_at: c.created_at as string,
    last_used_at: c.last_used_at as string | null,
    revoked_at: c.revoked_at as string | null,
    revoked_reason: c.revoked_reason as string | null,
    authenticatorName: aaguidToName(c.aaguid as string | null),
  }));

  return (
    <main className="page-shell">
      <div className="page-container">
        <div className="topbar mb-8">
          <div>
            <p className="eyebrow">Account</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">
              Signing Keys
            </h1>
            <p className="muted-copy mt-2">
              The devices that can sign documents in your name.
            </p>
          </div>

          <div className="topbar-nav">
            <ActiveLink href="/dashboard" className="button-secondary">
              Dashboard
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

        <div className="section-card mb-6 rounded-[2rem] border-l-4 border-l-teal-500 p-6">
          <h2 className="text-base font-semibold text-gray-900">
            If you see a key you do not recognise
          </h2>
          <p className="muted-copy mt-2 text-sm leading-6">
            Revoke it, then change your password. A key you did not register
            means someone else signed in to your account and enrolled their own
            device, which would let them sign documents as you. Revoking does
            not invalidate documents you have already signed — those stay
            verifiable against the key that signed them.
          </p>
        </div>

        <SigningKeyList keys={keys} rpId={getRpId()} />
      </div>
    </main>
  );
}
