/**
 * POST /api/portal/documents/upload
 *
 * Vercel Blob client-upload handler for the customer portal Documents page.
 * Uses handleUpload() (the "client upload" pattern) so files bypass the
 * Next.js server-action body limit and go directly to Blob storage from
 * the browser. This allows images, videos, and large documents (no ~1 MB cap).
 *
 * Two-phase flow:
 *   1. Browser calls this route first to get a signed upload token.
 *      We validate the portal session + extract orgId/contactId from the
 *      clientPayload the browser sends.
 *   2. Browser uploads directly to Vercel Blob with the signed token.
 *   3. Vercel Blob calls this route again (onUploadCompleted) once the
 *      upload finishes. We insert the portal_documents row here.
 *
 * Auth: portal session cookie (seldon_portal_session JWT). The contactId
 * and orgId are verified against the cookie — a client can only upload
 * to their own portal, never to another contact's.
 *
 * Ref: https://vercel.com/docs/storage/vercel-blob/client-upload
 */

import crypto from "node:crypto";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { contacts, organizations, portalDocuments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyPortalSession, PORTAL_SESSION_COOKIE } from "@/lib/portal/session";
import { checkPortalPlanGate } from "@/lib/portal/plan-gate";
import { emitSeldonEvent } from "@/lib/events/bus";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      // Blob token comes from BLOB_READ_WRITE_TOKEN env var automatically
      // when not explicitly provided.
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // ----------------------------------------------------------------
        // Phase 1: Authorize. Called when the browser requests a signed
        // upload token. We verify the portal session cookie and validate
        // the orgId/contactId from clientPayload before issuing the token.
        // ----------------------------------------------------------------

        // Parse clientPayload — browser sends JSON: { orgId, contactId }
        let orgId: string | null = null;
        let contactId: string | null = null;
        try {
          const raw: unknown =
            typeof clientPayload === "string"
              ? JSON.parse(clientPayload)
              : clientPayload;
          const parsed = (raw != null && typeof raw === "object" && !Array.isArray(raw))
            ? (raw as Record<string, unknown>)
            : null;
          orgId = typeof parsed?.orgId === "string" ? parsed.orgId : null;
          contactId =
            typeof parsed?.contactId === "string" ? parsed.contactId : null;
        } catch {
          throw new Error("Invalid clientPayload");
        }

        if (!orgId || !contactId) {
          throw new Error("Missing orgId or contactId in clientPayload");
        }

        // Verify portal session cookie.
        const cookieStore = await cookies();
        const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
        const session = verifyPortalSession(token);

        if (!session) {
          throw new Error("Unauthorized: no valid portal session");
        }
        if (session.orgId !== orgId || session.contactId !== contactId) {
          throw new Error(
            "Unauthorized: session scope does not match clientPayload"
          );
        }

        // Plan gate — same as operator upload.
        const gate = await checkPortalPlanGate(orgId);
        if (!gate.allowed) {
          throw new Error(
            "plan_gate_denied: " + (gate.reason ?? "upgrade required")
          );
        }

        // Confirm contact still belongs to the org (defensive).
        const [contactRow] = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
          .limit(1);
        if (!contactRow) {
          throw new Error("contact_not_found");
        }

        return {
          // Token is used by Vercel Blob to sign the onUploadCompleted
          // callback. We embed the upload metadata so Phase 2 can insert
          // the DB row without re-resolving the session (which won't be
          // available in the server-to-server callback).
          tokenPayload: JSON.stringify({ orgId, contactId }),
          // Allow any file type — let clients upload whatever they want.
          allowedContentTypes: [
            "image/*",
            "video/*",
            "audio/*",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain",
            "text/csv",
            "application/zip",
            "application/octet-stream",
          ],
          // Vercel Blob enforces this server-side; we set a generous 100 MB cap.
          maximumSizeInBytes: 100 * 1024 * 1024,
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // ----------------------------------------------------------------
        // Phase 2: Post-upload DB insert. Called by Vercel Blob once the
        // file is durably stored. Session cookie is NOT available here —
        // this is a server-to-server callback. We use tokenPayload
        // (embedded at token-generation time) instead.
        // ----------------------------------------------------------------
        let orgId: string | null = null;
        let contactId: string | null = null;
        try {
          const parsed = JSON.parse(tokenPayload ?? "{}") as Record<
            string,
            unknown
          >;
          orgId = typeof parsed.orgId === "string" ? parsed.orgId : null;
          contactId =
            typeof parsed.contactId === "string" ? parsed.contactId : null;
        } catch {
          console.error("[portal-doc-upload] Failed to parse tokenPayload", {
            tokenPayload,
          });
          return;
        }

        if (!orgId || !contactId) {
          console.error("[portal-doc-upload] Missing orgId/contactId in tokenPayload", { tokenPayload });
          return;
        }

        // Extract the original filename from the blob pathname.
        // Blob pathname is: portal/client/<orgId>/<contactId>/<uuid>-<safeName>
        // The browser sends the sanitized name via the upload pathname.
        const blobPath = blob.pathname;
        const blobUrl = blob.url;

        // Derive filename from blob.pathname (last segment, strip uuid prefix).
        const pathSegments = blobPath.split("/");
        const lastSegment = pathSegments[pathSegments.length - 1] ?? "file";
        // Strip the leading "<uuid>-" prefix we add in the pathname builder.
        const uuidPrefixRe = /^[0-9a-f-]{36}-/i;
        const fileName = uuidPrefixRe.test(lastSegment)
          ? lastSegment.replace(uuidPrefixRe, "")
          : lastSegment;

        // Restore spaces that were encoded as underscores in the safe name
        // (reverse of the sanitization in the client component).
        const displayFileName = fileName.replace(/_/g, " ");

        // Vercel Blob's PutBlobResult doesn't include file size.
        // We do a HEAD request on the blob URL to get Content-Length.
        // Falls back to 0 if the HEAD fails (non-fatal — size is cosmetic).
        let fileSize = 0;
        try {
          const headRes = await fetch(blobUrl, { method: "HEAD" });
          const cl = headRes.headers.get("content-length");
          if (cl) fileSize = parseInt(cl, 10);
        } catch {
          // best-effort
        }

        const [created] = await db
          .insert(portalDocuments)
          .values({
            orgId,
            contactId,
            fileName: displayFileName,
            fileSize,
            mimeType: blob.contentType ?? "application/octet-stream",
            blobUrl,
            blobPath,
            // uploadedByUserId is null for client-side uploads (no operator session).
          })
          .returning({ id: portalDocuments.id });

        if (created?.id) {
          void emitSeldonEvent(
            "portal.document_uploaded",
            {
              contactId,
              documentId: created.id,
              fileSize,
              uploadedBy: "client",
            },
            { orgId }
          ).catch(() => undefined);
        } else {
          console.error("[portal-doc-upload] DB insert returned no row", {
            orgId,
            contactId,
            blobPath,
          });
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload failed";
    console.error("[portal-doc-upload] handleUpload error", { message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
