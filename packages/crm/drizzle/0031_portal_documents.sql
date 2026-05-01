-- May 1, 2026 — Client Portal V1: file uploads.
--
-- portal_resources stores link-only references (operator pastes a URL,
-- client clicks "Open"). portal_documents stores first-class file
-- uploads backed by Vercel Blob — operator drags a file onto the
-- contact record's Documents tab, the server action stores the blob and
-- inserts a row here. The two tables coexist; the client portal's
-- /resources page merges them into one combined "Documents" list.
--
-- blob_path is the path argument we passed to @vercel/blob's put(). We
-- keep it (in addition to the public blob_url) so a future deletion UI
-- can call del(blob_path) without parsing it back out of the URL.
-- download_count is bumped from the client portal each time the file is
-- downloaded; viewed_at is stamped on the first download (COALESCE pattern,
-- mirrors portal_resources.viewed_at semantics).
CREATE TABLE IF NOT EXISTS "portal_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "file_name" text NOT NULL,
  "file_size" bigint NOT NULL,
  "mime_type" text NOT NULL,
  "blob_url" text NOT NULL,
  "blob_path" text NOT NULL,
  "uploaded_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "viewed_at" timestamp with time zone,
  "download_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "portal_documents_org_contact_idx"
  ON "portal_documents" ("org_id", "contact_id");

CREATE INDEX IF NOT EXISTS "portal_documents_uploader_idx"
  ON "portal_documents" ("uploaded_by_user_id");
