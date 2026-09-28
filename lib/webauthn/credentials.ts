// Reading and writing WebAuthn credentials.
//
// Credentials live in `webauthn_credentials`, one row per device, and are
// never overwritten: registering on a new device inserts a row. Revoking sets
// `revoked_at` rather than deleting, so signatures made with an older key can
// still be verified against the key that actually produced them.

import type { SupabaseClient } from "@supabase/supabase-js";

export type StoredCredentialRow = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
  device_type: string | null;
  aaguid: string | null;
  device_label: string | null;
  created_at: string;
  revoked_at: string | null;
};

const COLUMNS =
  "id, user_id, credential_id, public_key, counter, transports, device_type, aaguid, device_label, created_at, revoked_at";

// Credentials a user may sign with right now.
export async function getActiveCredentials(
  db: SupabaseClient,
  userId: string
): Promise<StoredCredentialRow[]> {
  const { data } = await db
    .from("webauthn_credentials")
    .select(COLUMNS)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: true });

  return (data as StoredCredentialRow[] | null) ?? [];
}

// Every credential, revoked ones included. Verification of historical
// signatures needs these: a signature stays valid even after its key is
// retired, and reporting it as invalid would be wrong.
export async function getAllCredentials(
  db: SupabaseClient,
  userId: string
): Promise<StoredCredentialRow[]> {
  const { data } = await db
    .from("webauthn_credentials")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  return (data as StoredCredentialRow[] | null) ?? [];
}

// Look up the exact key that produced a stored signature.
export async function getCredentialById(
  db: SupabaseClient,
  credentialId: string
): Promise<StoredCredentialRow | null> {
  const { data } = await db
    .from("webauthn_credentials")
    .select(COLUMNS)
    .eq("credential_id", credentialId)
    .maybeSingle();

  return (data as StoredCredentialRow | null) ?? null;
}

export async function hasActiveCredential(
  db: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { count } = await db
    .from("webauthn_credentials")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("revoked_at", null);

  return (count ?? 0) > 0;
}

// Has this account EVER held a signing key, revoked ones included?
//
// This is what gates self-service registration, not hasActiveCredential().
// Counting only active keys left a way around the approval requirement:
// revoke every key, and the account looks new again, so a stolen password
// could register a key with nobody approving it. Once an account has held a
// key, registering another always needs approval — however many were revoked.
export async function hasEverHeldCredential(
  db: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { count } = await db
    .from("webauthn_credentials")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  return (count ?? 0) > 0;
}

export async function updateCredentialCounter(
  db: SupabaseClient,
  credentialId: string,
  counter: number
): Promise<void> {
  await db
    .from("webauthn_credentials")
    .update({ counter, last_used_at: new Date().toISOString() })
    .eq("credential_id", credentialId);
}
