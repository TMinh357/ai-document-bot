-- Remove duplicate/overly-permissive RLS policies.
--
-- Postgres OR-combines PERMISSIVE policies for the same command, so a loose
-- policy sitting next to a strict one silently widens access to the loose one.
-- Several tables had accumulated a second policy from earlier iterations.
--
-- The important one is document_versions: "Users can view versions of accessible
-- documents" only checked that the parent document row existed
--
--     EXISTS (SELECT 1 FROM documents WHERE documents.id = document_versions.document_id)
--
-- with no owner/reviewer/admin predicate, so it overrode the strict policy and
-- let any authenticated user read file_path and content_text for every document.
-- Verified after applying: an unrelated employee sees 0 rows, the owner sees 1.
--
-- The rest are exact-duplicate leftovers; dropping them changes no access,
-- it just leaves one policy per table/command.

-- Security fix: strict policy "Users can view accessible document versions" remains.
drop policy if exists "Users can view versions of accessible documents" on public.document_versions;

-- Cleanup: "Users can view accessible documents" remains (owner OR admin OR assigned reviewer).
drop policy if exists "Users can view related documents" on public.documents;

-- Cleanup: "Authenticated users can view document signatures" and
-- "Users can create their own signatures" remain.
drop policy if exists "Authenticated users can view signatures" on public.document_signatures;
drop policy if exists "Users can sign as themselves" on public.document_signatures;

-- Cleanup: "Authenticated users can view audit logs" remains and is broader,
-- so the own-rows-only policy was dead weight.
drop policy if exists "Users can view own logs" on public.audit_logs;
