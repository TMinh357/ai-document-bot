# Supabase Context for AI Document Review Assistant

## 1. Project Overview

Project name: AI Document Review Assistant

Tech stack:
- Next.js
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage
- Vercel

Main roles:
- employee: creates documents, uploads PDF files, and submits documents for review.
- reviewer: reviews assigned documents and approves or rejects them with comments.
- admin: reserved for future management features.

Main features:
- User authentication
- Role-based document workflow
- PDF upload
- Document list and detail pages
- Review queue
- Approve / reject workflow
- Approval history
- Activity logs
- AI Assistant for PDF text extraction, summary, key points, risk notes, and Q&A
- Basic digital signature demo using SHA-256 file hashing

---

## 2. Database Schema

table_name	column_name	data_type	is_nullable	column_default
approvals	id	uuid	NO	gen_random_uuid()
approvals	document_id	uuid	NO	null
approvals	reviewer_id	uuid	NO	null
approvals	status	text	NO	pending'::text
approvals	comment	text	YES	null
approvals	created_at	timestamp with time zone	YES	now()
approvals	reviewed_at	timestamp with time zone	YES	null
audit_logs	id	uuid	NO	gen_random_uuid()
audit_logs	user_id	uuid	YES	null
audit_logs	action	text	NO	null
audit_logs	target_table	text	YES	null
audit_logs	target_id	uuid	YES	null
audit_logs	metadata	jsonb	YES	null
audit_logs	created_at	timestamp with time zone	YES	now()
document_ai_messages	id	uuid	NO	gen_random_uuid()
document_ai_messages	document_id	uuid	NO	null
document_ai_messages	user_id	uuid	YES	null
document_ai_messages	question	text	NO	null
document_ai_messages	answer	text	NO	null
document_ai_messages	created_at	timestamp with time zone	YES	now()
document_ai_results	id	uuid	NO	gen_random_uuid()
document_ai_results	document_id	uuid	NO	null
document_ai_results	user_id	uuid	YES	null
document_ai_results	summary	text	YES	null
document_ai_results	key_points	text	YES	null
document_ai_results	risk_notes	text	YES	null
document_ai_results	created_at	timestamp with time zone	YES	now()
document_signatures	id	uuid	NO	gen_random_uuid()
document_signatures	document_id	uuid	NO	null
document_signatures	signer_id	uuid	NO	null
document_signatures	signature_hash	text	NO	null
document_signatures	signed_at	timestamp with time zone	YES	now()
document_versions	id	uuid	NO	gen_random_uuid()
document_versions	document_id	uuid	NO	null
document_versions	version_no	integer	NO	null
document_versions	file_path	text	YES	null
document_versions	content_text	text	YES	null
document_versions	created_by	uuid	YES	null
document_versions	created_at	timestamp with time zone	YES	now()
documents	id	uuid	NO	gen_random_uuid()
documents	title	text	NO	null
documents	description	text	YES	null
documents	owner_id	uuid	NO	null
documents	status	text	NO	draft'::text
documents	created_at	timestamp with time zone	YES	now()
documents	updated_at	timestamp with time zone	YES	now()
profiles	id	uuid	NO	null
profiles	full_name	text	YES	null
profiles	role	text	NO	employee'::text
profiles	created_at	timestamp with time zone	YES	now()

---

## 3. Foreign Keys

table_name	column_name	foreign_table_name	foreign_column_name
approvals	document_id	documents	id
document_ai_messages	document_id	documents	id
document_ai_results	document_id	documents	id
document_signatures	document_id	documents	id
document_versions	document_id	documents	id
---

## 4. RLS Policies

schemaname	tablename	policyname	permissive	roles	cmd	qual	with_check
public	approvals	Authenticated users can view approvals	PERMISSIVE	{authenticated}	SELECT	TRUE	null
public	approvals	Document owners can create approval requests	PERMISSIVE	{authenticated}	INSERT	null	"(EXISTS ( SELECT 1
   FROM documents
  WHERE ((documents.id = approvals.document_id) AND (documents.owner_id = auth.uid()))))"
public	approvals	Reviewers can update their approvals	PERMISSIVE	{authenticated}	UPDATE	(auth.uid() = reviewer_id)	(auth.uid() = reviewer_id)
public	audit_logs	Authenticated users can view audit logs	PERMISSIVE	{authenticated}	SELECT	TRUE	null
public	audit_logs	Users can create own logs	PERMISSIVE	{authenticated}	INSERT	null	(auth.uid() = user_id)
public	audit_logs	Users can view own logs	PERMISSIVE	{authenticated}	SELECT	(auth.uid() = user_id)	null
public	document_ai_messages	Authenticated users can create AI messages	PERMISSIVE	{authenticated}	INSERT	null	(auth.uid() = user_id)
public	document_ai_messages	Authenticated users can view AI messages	PERMISSIVE	{authenticated}	SELECT	TRUE	null
public	document_ai_results	Authenticated users can create AI results	PERMISSIVE	{authenticated}	INSERT	null	(auth.uid() = user_id)
public	document_ai_results	Authenticated users can view AI results	PERMISSIVE	{authenticated}	SELECT	TRUE	null
public	document_signatures	Authenticated users can view document signatures	PERMISSIVE	{authenticated}	SELECT	TRUE	null
public	document_signatures	Authenticated users can view signatures	PERMISSIVE	{authenticated}	SELECT	TRUE	null
public	document_signatures	Users can create their own signatures	PERMISSIVE	{authenticated}	INSERT	null	(auth.uid() = signer_id)
public	document_signatures	Users can sign as themselves	PERMISSIVE	{authenticated}	INSERT	null	(auth.uid() = signer_id)
public	document_versions	Authenticated users can view document versions	PERMISSIVE	{authenticated}	SELECT	TRUE	null
public	document_versions	Users can create document versions	PERMISSIVE	{authenticated}	INSERT	null	(auth.uid() = created_by)
public	document_versions	Users can update extracted document text	PERMISSIVE	{authenticated}	UPDATE	"((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM documents
  WHERE ((documents.id = document_versions.document_id) AND (documents.owner_id = auth.uid())))))"	"((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM documents
  WHERE ((documents.id = document_versions.document_id) AND (documents.owner_id = auth.uid())))))"
public	documents	Assigned reviewers can update related documents	PERMISSIVE	{authenticated}	UPDATE	"(EXISTS ( SELECT 1
   FROM approvals
  WHERE ((approvals.document_id = documents.id) AND (approvals.reviewer_id = auth.uid()))))"	"(EXISTS ( SELECT 1
   FROM approvals
  WHERE ((approvals.document_id = documents.id) AND (approvals.reviewer_id = auth.uid()))))"
public	documents	Authenticated users can view documents	PERMISSIVE	{authenticated}	SELECT	TRUE	null
public	documents	Owners can update own documents	PERMISSIVE	{authenticated}	UPDATE	(auth.uid() = owner_id)	(auth.uid() = owner_id)
public	documents	Users can create own documents	PERMISSIVE	{authenticated}	INSERT	null	(auth.uid() = owner_id)
public	profiles	Authenticated users can view all profiles	PERMISSIVE	{authenticated}	SELECT	TRUE	null
public	profiles	Users can update own profile	PERMISSIVE	{public}	UPDATE	(auth.uid() = id)	(auth.uid() = id)
public	profiles	Users can view own profile	PERMISSIVE	{public}	SELECT	(auth.uid() = id)	null

---

## 5. Triggers

No triggers found in the public schema.
---

## 6. Functions

routine_name	routine_type	data_type
handle_new_user	FUNCTION	trigger

---

## 7. Sample Data

### profiles

id	full_name	role	created_at
6a4b8205-62eb-4382-bcaf-26e6553c2a8b	minh	employee	2026-04-28 03:43:50.806963+00
e9c66098-d14f-48d0-afb0-c757ccbf5ddb	tm	reviewer	2026-04-28 07:32:07.837928+00
663cbfe5-df84-4a75-a6a1-3aef3cdfac41	tm2	reviewer	2026-04-28 07:38:19.82772+00
9062e822-3d26-4ad4-9d0d-7036db29c224	tm3	admin	2026-04-29 04:51:49.136602+00

### documents

id	title	description	owner_id	status	created_at	updated_at
481f3d9e-5879-4e6d-aadb-25c534dae8ad	TM	....	6a4b8205-62eb-4382-bcaf-26e6553c2a8b	draft	2026-04-28 04:01:26.021486+00	2026-04-28 04:01:26.021486+00
cf0080de-627b-47a5-8a2a-0f230197b094	tm2	.	6a4b8205-62eb-4382-bcaf-26e6553c2a8b	signed	2026-04-28 04:41:46.035382+00	2026-05-05 01:51:24.171+00




