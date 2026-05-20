-- Migration: WebAuthn / Windows Hello digital signatures with multi-party signing.
-- Run this in the Supabase SQL editor before deploying the new signing code.

-- 1. WebAuthn credential per user.
--    webauthn_credential_id : the credential ID returned by navigator.credentials.create (base64url)
--    webauthn_public_key    : the COSE-encoded public key (base64)
--    webauthn_counter       : the signature counter (used to detect cloned authenticators)
--    webauthn_device_type   : 'singleDevice' or 'multiDevice'
--    webauthn_transports    : authenticator transports, e.g. ['internal'] for Windows Hello
--    Also keep the legacy public_key columns for backwards compatibility with old signatures.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS public_key text,
  ADD COLUMN IF NOT EXISTS key_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS webauthn_credential_id text,
  ADD COLUMN IF NOT EXISTS webauthn_public_key text,
  ADD COLUMN IF NOT EXISTS webauthn_counter bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS webauthn_device_type text,
  ADD COLUMN IF NOT EXISTS webauthn_transports text[],
  ADD COLUMN IF NOT EXISTS webauthn_registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS webauthn_aaguid text;

-- 2. Signatures table now stores either:
--    (a) legacy ECDSA: signature_bytes only (algorithm = 'ECDSA-P256')
--    (b) WebAuthn:     signature_bytes + client_data_json + authenticator_data (algorithm = 'WebAuthn-ES256')
ALTER TABLE document_signatures
  ADD COLUMN IF NOT EXISTS signature_bytes text,
  ADD COLUMN IF NOT EXISTS algorithm text DEFAULT 'SHA-256',
  ADD COLUMN IF NOT EXISTS signature_role text,
  ADD COLUMN IF NOT EXISTS round_no integer,
  ADD COLUMN IF NOT EXISTS client_data_json text,
  ADD COLUMN IF NOT EXISTS authenticator_data text,
  ADD COLUMN IF NOT EXISTS credential_id text;

-- 3. One signature per (document, signer, role, round).
CREATE UNIQUE INDEX IF NOT EXISTS document_signatures_role_unique
  ON document_signatures (document_id, signer_id, signature_role, round_no)
  WHERE signature_role IS NOT NULL;
