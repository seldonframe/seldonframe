/**
 * POST /api/v1/workspace/media/upload
 *
 * Vercel Blob client-upload token route for the SeldonChat attach/drag-drop
 * control (media-editing T4). Mirrors the customer-portal documents upload
 * pattern (api/portal/documents/upload/route.ts): `handleUpload()` so the
 * browser uploads DIRECTLY to Blob (bypasses the ~1 MB server-action body
 * cap — needed for images and up to ~50 MB video), never through this
 * function's own request body.
 *
 * Auth: the dashboard SESSION ONLY (getOrgId() — NextAuth / operator-portal
 * / admin-token, same resolution every dashboard route uses). The org is
 * NEVER taken from the client payload — a signed-in user can only ever get
 * a token scoped to their OWN org's session, so there is nothing for a
 * malicious clientPayload to override.
 *
 * This route does NOT apply the upload anywhere (no setR1Media call) — it
 * only grants the upload token and validates content-type/size. Applying
 * the resulting blob URL to a media slot happens via the copilot's
 * update_media tool (the single SSRF-gated apply path — resolveExternalMedia
 * re-validates even this route's own blob URL), which is how the chat
 * client threads the attachment through after upload completes.
 *
 * Ref: https://vercel.com/docs/storage/vercel-blob/client-upload
 */

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { getOrgId } from "@/lib/auth/helpers";
import { decideMediaUploadGrant } from "@/lib/media/upload-token";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      // Blob token comes from BLOB_READ_WRITE_TOKEN env var automatically
      // when not explicitly provided.
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        // ------------------------------------------------------------
        // Auth: session ONLY. Never trust an orgId from clientPayload —
        // getOrgId() resolves the org from the request's own cookies.
        // ------------------------------------------------------------
        const orgId = await getOrgId();

        // Content type: the browser announces the file's type via
        // clientPayload (Blob's own `contentType` handshake happens after
        // token issuance, so we validate what the client tells us it will
        // send here; Blob itself re-checks the upload's actual bytes
        // against `allowedContentTypes` server-side).
        let contentType = "";
        try {
          const raw: unknown =
            typeof clientPayload === "string"
              ? JSON.parse(clientPayload)
              : clientPayload;
          const parsed =
            raw != null && typeof raw === "object" && !Array.isArray(raw)
              ? (raw as Record<string, unknown>)
              : null;
          contentType =
            typeof parsed?.contentType === "string" ? parsed.contentType : "";
        } catch {
          throw new Error("Invalid clientPayload");
        }

        const grant = decideMediaUploadGrant({ orgId, contentType });
        if (!grant.ok) {
          throw new Error(
            grant.error === "unauthorized"
              ? "Unauthorized: no valid session"
              : `content_type_not_allowed: ${contentType || "(missing)"}`,
          );
        }

        return {
          tokenPayload: JSON.stringify({ orgId, kind: grant.kind }),
          allowedContentTypes: grant.allowedContentTypes,
          maximumSizeInBytes: grant.maximumSizeInBytes,
        };
      },

      // No onUploadCompleted DB write needed — the chat client applies the
      // resulting blob URL via update_media (copilot tool), which is the
      // single source of truth for "where did this media end up."
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    console.error("[media-upload] handleUpload error", { message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
