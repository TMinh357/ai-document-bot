-- WebAuthn credential lifecycle: many credentials per user, plus a guarded
-- path for registering a credential on a new device.
--
-- Why this exists
-- ---------------
-- The credential used to live in a single set of columns on `profiles`, so
-- registering on a new device overwrote the previous public key. Two problems
-- followed from that:
--
--   1. Signatures made with the overwritten key stopped verifying, even though
--      the file was untouched.
--   2. Anyone who obtained a user's password could sign in on their own
--      machine, self-issue a new signing key, and sign as that user. The
--      signature then proved no more than the password did, which defeats the
--      point of having a signing key at all.
--
-- This migration stores credentials as rows, never overwriting, and adds an
-- approval request that must be satisfied before a *second* credential can be
-- registered. The first credential for an account is still self-service.

-- ---------------------------------------------------------------------------
-- 1. Credentials, one row per device.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  credential_id   text NOT NULL UNIQUE,
  public_key      text NOT NULL,              -- base64 COSE key
  counter         bigint NOT NULL DEFAULT 0,
  device_type     text,                       -- 'singleDevice' | 'multiDevice'
  transports      text[],
  aaguid          text,
  device_label    text,                       -- friendly name, e.g. "Work laptop"
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz,
  revoked_at      timestamptz,                -- NULL = active
  revoked_reason  text
);

CREATE INDEX IF NOT EXISTS webauthn_credentials_user_idx
  ON webauthn_credentials (user_id);

-- Look-ups during verification go by credential_id.
CREATE INDEX IF NOT EXISTS webauthn_credentials_cred_idx
  ON webauthn_credentials (credential_id);

-- Active credentials only — used to decide whether a user may self-register.
CREATE INDEX IF NOT EXISTS webauthn_credentials_active_idx
  ON webauthn_credentials (user_id)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Approval requests for registering an additional device.
--
--    approval_method:
--      'existing_key' — the user proved possession of a current credential
--      'admin'        — an administrator vouched for them out of band
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_approval_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  pairing_code     text NOT NULL,             -- short code shown on both screens
  challenge        text NOT NULL,             -- signed by the existing key
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'used',
                                       'rejected', 'expired')),
  approval_method  text
                     CHECK (approval_method IN ('existing_key', 'admin')),
  approved_by      uuid REFERENCES profiles (id),
  approved_at      timestamptz,
  -- Registration must happen inside this window once approved.
  expires_at       timestamptz NOT NULL,
  requested_ip     text,
  requested_agent  text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_approval_user_idx
  ON device_approval_requests (user_id, status);

-- ---------------------------------------------------------------------------
-- 3. Backfill: move each profile's existing credential into the new table.
--    The legacy columns stay for now so a rollback is possible; the code
--    reads exclusively from webauthn_credentials.
-- ---------------------------------------------------------------------------
INSERT INTO webauthn_credentials (
  user_id, credential_id, public_key, counter,
  device_type, transports, aaguid, device_label, created_at
)
SELECT
  id,
  webauthn_credential_id,
  webauthn_public_key,
  COALESCE(webauthn_counter, 0),
  webauthn_device_type,
  webauthn_transports,
  webauthn_aaguid,
  'Original device',
  COALESCE(webauthn_registered_at, now())
FROM profiles
WHERE webauthn_credential_id IS NOT NULL
  AND webauthn_public_key IS NOT NULL
ON CONFLICT (credential_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Row-Level Security.
--
--    Public keys stay readable by any authenticated user because the verify
--    and certificate pages re-verify other signers' signatures. Only public
--    keys are exposed; private keys never leave the signer's device.
--
--    Writes go through service-role API routes after explicit authorization,
--    so there is deliberately no INSERT/UPDATE policy for the anon client.
-- ---------------------------------------------------------------------------
ALTER TABLE webauthn_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view credentials"
  ON webauthn_credentials;
CREATE POLICY "Authenticated users can view credentials"
  ON webauthn_credentials FOR SELECT
  TO authenticated
  USING (true);

-- A user may see their own device-approval requests; nobody else's.
ALTER TABLE device_approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own device requests"
  ON device_approval_requests;
CREATE POLICY "Users can view own device requests"
  ON device_approval_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
