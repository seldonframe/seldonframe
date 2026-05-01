# Portal Documents (file upload) — Implementation Plan

> Branch: `ws1-webhook-pricing-fixes` (worktree: `blueprint-renderer`)
> Builds on commit 823aafb1 — Client Portal V1.

**Goal:** Add first-class file uploads to the Client Portal. Operators drag-and-drop files into a contact's Documents tab; clients see them in their portal alongside the existing link-only resources, and download tracking bumps a counter.

**Architecture:** New table `portal_documents` (separate from `portal_resources` — they coexist). Files live in Vercel Blob; the row stores the blob URL + path. Server actions handle upload (operator, plan-gated) and download tracking (client). UI is a new Documents tab on the contact record + a merged list on `/portal/[orgSlug]/resources`.

**Tech stack:** Next.js 16 server actions, Drizzle ORM, Vercel Blob, Tailwind, lucide-react.

---

## Files

**Create:**
- `packages/crm/drizzle/0031_portal_documents.sql`
- `packages/crm/src/db/schema/portal-documents.ts`
- `packages/crm/src/components/contacts/contact-documents-tab.tsx`
- `packages/crm/src/components/portal/portal-documents-row.tsx` (download button — client component)

**Modify:**
- `packages/crm/package.json` (+ `@vercel/blob`)
- `packages/crm/src/db/schema/index.ts`
- `packages/crm/src/lib/portal/admin-actions.ts` (+ `uploadPortalDocumentAction`)
- `packages/crm/src/lib/portal/actions.ts` (+ `listPortalDocuments`, + `markPortalDocumentDownloadedAction`)
- `packages/crm/src/components/contacts/contact-record-detail.tsx` (+ Documents tab)
- `packages/crm/src/app/contacts/[contactId]/page.tsx` (or wherever it lives — find before Task 6) — fetch + pass docs
- `packages/crm/src/app/portal/[orgSlug]/(client)/resources/page.tsx` — merge resources + documents
- `packages/crm/src/components/portal/portal-resource-list.tsx` — keep, still used for link rows

---

## Tasks

### 1. Add `@vercel/blob` to deps
- Edit `packages/crm/package.json`, alphabetize, add `"@vercel/blob": "^0.27.0"`.
- Run `pnpm install` from repo root.

### 2. Migration 0031 — `portal_documents`
- Mirror the style of 0030 (header comment, IF NOT EXISTS, indexes).
- Columns per spec: id, org_id, contact_id, file_name, file_size (bigint), mime_type, blob_url, blob_path, uploaded_by_user_id, viewed_at, download_count (integer default 0), created_at, updated_at.
- Indexes: (org_id, contact_id) and (uploaded_by_user_id).

### 3. Drizzle schema + index export
- Create `portal-documents.ts` matching the migration column-for-column. `bigint` mode `"number"` (file sizes fit in JS number for our use case).
- Add `export * from "./portal-documents";` near the other portal-* exports.

### 4. `uploadPortalDocumentAction` (admin-actions.ts)
- FormData input: `orgId`, `contactId`, `file`.
- `assertWritable()`, NextAuth `auth()`, org existence check, `checkPortalPlanGate`, contact-belongs-to-org check.
- Build blob path: `org/<orgId>/contact/<contactId>/<uuid>-<safeFileName>`.
- Call `put(blobPath, file, { access: "public", contentType, addRandomSuffix: false })`.
- Insert row, return `{ ok: true; documentId } | { ok: false; reason }`.

### 5. `listPortalDocuments` + `markPortalDocumentDownloadedAction` (actions.ts)
- Read pattern matches `listPortalResources` — `requirePortalSessionForOrg` + `assertPortalEnabled`, scope by `orgId + contactId`.
- Download action: atomic `download_count + 1`, `viewedAt = COALESCE(viewedAt, now())`. Emit `portal.document_downloaded` event.

### 6. Operator Documents tab
- New client component `contact-documents-tab.tsx`:
  - Props: `{ orgId, contactId, documents }`.
  - Drag-and-drop dropzone using native HTML5 events + hidden `<input type="file">`. No extra deps.
  - On drop: build FormData, call `uploadPortalDocumentAction`, show inline error or `router.refresh()` on success.
  - Existing-docs list: filename, size (humanize), uploaded at, download count.
- Modify `contact-record-detail.tsx`:
  - Extend tab union to include `"documents"`.
  - Add to `TABS` array (icon: `FileText` from lucide-react).
  - Accept `documents` prop, plumb to a new `tab === "documents"` branch.
- Find the server page that renders `ContactRecordDetail`, fetch documents there, pass down.

### 7. Merge resources + documents in client portal
- `app/portal/[orgSlug]/(client)/resources/page.tsx`:
  - Fetch `listPortalResources()` and `listPortalDocuments()` in parallel.
  - Pass both arrays to a new combined list component (or keep existing `PortalResourceList` for link rows and add a `PortalDocumentsList` below).
  - Decision: simplest is to keep `PortalResourceList` as-is and add a separate `PortalDocumentsList` section. The page renders both with section headings ("Files" and "Links") if either is non-empty, else a single empty state.
- New component `portal-documents-row.tsx` (or inline in `portal-documents-list.tsx`):
  - Each row: filename, size, mime icon, download count.
  - Download button: calls `markPortalDocumentDownloadedAction(orgSlug, id)` then opens `blobUrl` in a new tab.

### 8. Verification
- `cd packages/crm && npx tsc --noEmit` → 0 errors.
- `pnpm --filter @seldonframe/crm lint` → 0 errors.
- Visual sanity: existing `portal_resources` rows still render with the merged list.
- Commit + push.

---

## Notes / risks

1. **Server-action body size.** Next 16 default is 1MB. Files >1MB need `experimental.serverActions.bodySizeLimit` bumped or a switch to client-side `@vercel/blob` `upload()`. Spec says `put()`, so V1 ships server-side and we accept the limit.
2. **`BLOB_READ_WRITE_TOKEN`.** Required env var for `put()`. Present on Vercel; local dev needs it set or upload fails (acceptable for V1).
3. **No deletion UI.** Per spec — keeping `blob_path` so a future task can call `del()`. Migration is forward-only.

---

## Review (2026-05-01)

Shipped the plan as written. What landed:

- Migration `0031_portal_documents.sql` created the new table, FKs, and the two indexes (`org_contact_idx`, `uploader_idx`).
- Drizzle schema `portal-documents.ts` + `index.ts` export. `bigint` mode `"number"` is fine for our file sizes (well under `Number.MAX_SAFE_INTEGER`).
- `uploadPortalDocumentAction` (admin-actions.ts) — auth + org scope + plan gate + contact-belongs-to-org + Vercel `put()` + insert + `portal.document_uploaded` event emission.
- `listPortalDocuments` + `markPortalDocumentDownloadedAction` (actions.ts) — atomic SQL increment for `download_count`, `COALESCE` for `viewed_at` so first-viewed is preserved.
- Operator UI: new `contact-documents-tab.tsx` (drag-drop + filename/size/uploaded/downloads list), wired into `contact-record-detail.tsx` as a new "Documents" tab between Bookings and Notes; server page `(dashboard)/contacts/[id]/page.tsx` fetches `portal_documents` in the parallel batch and serializes to client.
- Client portal: `(client)/resources/page.tsx` rewritten to show "Files" (documents) above "Links" (resources), with a single empty state when both are absent. New `portal-documents-list.tsx` component; download bumps the counter via the server action.

Verification:
- `npx tsc --noEmit` exits 0.
- Targeted `npx eslint` on the changed files reports 0 errors and 0 new warnings (the 5 remaining warnings are pre-existing unused imports in files I touched but did not introduce).

Notes for follow-ups:
- No deletion UI yet (per spec). `blob_path` is stored for the future `del()` call.
- Server-action body limit (Next 16 default 1 MB) caps file size; bumping is a config-only change in `next.config.ts` if needed.
- `BLOB_READ_WRITE_TOKEN` env var is required for Vercel Blob `put()`. Already provisioned in production; local dev needs it set or upload fails fast.
