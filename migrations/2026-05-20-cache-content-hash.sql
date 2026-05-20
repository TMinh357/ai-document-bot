-- Performance: cache the SHA-256 content hash on each version row so we don't
-- have to re-download the PDF from storage on every sign / approve / verify.
-- Legacy rows have NULL content_hash and will be backfilled lazily the first
-- time they're hashed.

ALTER TABLE document_versions
  ADD COLUMN IF NOT EXISTS content_hash text;
