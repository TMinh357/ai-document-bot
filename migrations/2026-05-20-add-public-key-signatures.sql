-- Migration: Public-key digital signatures with multi-party signing.
-- Run this in the Supabase SQL editor before deploying the new signing code.
-- Existing rows are preserved as "legacy" signatures.

-- 1. Store each user's ECDSA P-256 public key (JWK as JSON text).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS public_key text,
  ADD COLUMN IF NOT EXISTS key_created_at timestamptz;

-- 2. Multi-party signing on document_signatures.
--    signature_bytes  : raw ECDSA signature, NULL for pre-migration rows.
--    algorithm        : 'ECDSA-P256' for new rows, 'SHA-256' for legacy.
--    signature_role   : 'owner_submission' (owner signs at submit)
--                       or 'reviewer_approval' (reviewer signs at approve).
--                       NULL for pre-migration rows (legacy post-approval signing).
--    round_no         : the review round this signature belongs to (matches approvals.round_no).
ALTER TABLE document_signatures
  ADD COLUMN IF NOT EXISTS signature_bytes text,
  ADD COLUMN IF NOT EXISTS algorithm text DEFAULT 'SHA-256',
  ADD COLUMN IF NOT EXISTS signature_role text,
  ADD COLUMN IF NOT EXISTS round_no integer;

-- 3. Prevent duplicate signatures for the same role + signer + round.
--    Owner can only sign each round once; each reviewer can only sign each round once.
CREATE UNIQUE INDEX IF NOT EXISTS document_signatures_role_unique
  ON document_signatures (document_id, signer_id, signature_role, round_no)
  WHERE signature_role IS NOT NULL;
