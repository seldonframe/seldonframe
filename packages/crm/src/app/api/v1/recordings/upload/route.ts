/**
 * POST /api/v1/recordings/upload
 *
 * Vercel Blob client-upload token route for the /record capture flow.
 * Mirrors api/v1/workspace/media/upload/route.ts's `handleUpload()` shape
 * (browser uploads DIRECTLY to Blob, bypassing this function's own request
 * body) with ONE deliberate difference in auth:
 *
 *   The media route resolves the org from the DASHBOARD SESSION (getOrgId())
 *   because it's an authed, in-app upload. This route has no dashboard
 *   session at all — the caller is an anonymous /record visitor — so auth
 *   is the recording SESSION BEARER TOKEN, passed through `clientPayload`
 *   (never getOrgId(), never a body/query orgId). The existing media route
 *   is NOT modified by this file.
 *
 * Every granted token is pinned to:
 *   - content type: image/jpeg (keyframes) or video/webm (screen capture),
 *     nothing else
 *   - size: IMAGE_MAX_BYTES / VIDEO_MAX_BYTES respectively
 *   - pathname: must start with `recordings/<sessionId>/` for the CALLING
 *     session's own id — never another session's prefix
 *
 * Ref: https://vercel.com/docs/storage/vercel-blob/client-upload
 */

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { isRecordToAgentOn } from "@/lib/recordings/policy";
import { findSessionByToken } from "@/lib/recordings/session-store";
import { ALLOWED_IMAGE_CONTENT_TYPES, IMAGE_MAX_BYTES } from "@/lib/page-blocks/images";
import { VIDEO_MAX_BYTES } from "@/lib/media/resolve-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_VIDEO_CONTENT_TYPE = "video/webm";

/** pathname must live under this session's own `recordings/<sessionId>/`
 *  prefix — same shape as recording/route.ts's isValidRecordingBlobUrl, but
 *  operating on the bare pathname handleUpload hands us (no host to check
 *  here; Blob itself owns the host). */
export function isAllowedRecordingPathname(pathname: string, sessionId: string): boolean {
  const normalized = pathname.replace(/^\//, "");
  return normalized.startsWith(`recordings/${sessionId}/`);
}

/** Pure grant resolution for a given content type — null when the type
 *  isn't one of the two the /record flow ever produces. Exported so the
 *  authz test pins both accepted types and the rejection without touching
 *  Blob or a real DB. */
export function resolveUploadGrant(params: {
  contentType: string;
}): { allowedContentTypes: string[]; maximumSizeInBytes: number } | null {
  if ((ALLOWED_IMAGE_CONTENT_TYPES as readonly string[]).includes(params.contentType)) {
    return { allowedContentTypes: [params.contentType], maximumSizeInBytes: IMAGE_MAX_BYTES };
  }
  if (params.contentType === ALLOWED_VIDEO_CONTENT_TYPE) {
    return { allowedContentTypes: [ALLOWED_VIDEO_CONTENT_TYPE], maximumSizeInBytes: VIDEO_MAX_BYTES };
  }
  return null;
}

function parseClientPayload(clientPayload: string | null): { token: string; contentType: string } {
  if (!clientPayload) {
    throw new Error("Invalid clientPayload");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(clientPayload);
  } catch {
    throw new Error("Invalid clientPayload");
  }
  const parsed =
    raw != null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const token = typeof parsed?.token === "string" ? parsed.token : "";
  const contentType = typeof parsed?.contentType === "string" ? parsed.contentType : "";
  if (!token) {
    throw new Error("Invalid clientPayload: missing token");
  }
  return { token, contentType };
}

export async function POST(request: Request): Promise<Response> {
  if (!isRecordToAgentOn({ SF_RECORD_TO_AGENT: process.env.SF_RECORD_TO_AGENT })) {
    return new Response(null, { status: 404 });
  }

  const body = (await request.json()) as HandleUploadBody;
  const tokenEnv = { AUTH_SECRET: process.env.AUTH_SECRET, NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET };

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname: string, clientPayload: string | null) => {
        // Auth: the recording SESSION BEARER TOKEN only — never getOrgId(),
        // never an orgId out of the body/clientPayload. A signed-in
        // dashboard session has nothing to do with this route.
        const { token, contentType } = parseClientPayload(
          typeof clientPayload === "string" ? clientPayload : null,
        );

        const session = await findSessionByToken(db, token, tokenEnv);
        if (!session) {
          throw new Error("Unauthorized: invalid session token");
        }

        if (!isAllowedRecordingPathname(pathname, session.id)) {
          throw new Error("pathname_not_allowed");
        }

        const grant = resolveUploadGrant({ contentType });
        if (!grant) {
          throw new Error(`content_type_not_allowed: ${contentType || "(missing)"}`);
        }

        return {
          tokenPayload: JSON.stringify({ sessionId: session.id }),
          allowedContentTypes: grant.allowedContentTypes,
          maximumSizeInBytes: grant.maximumSizeInBytes,
        };
      },

      // No DB write on completion — the recording route (../recording)
      // is the single place that persists blob URLs, once the browser has
      // finished uploading every frame + the video for a slot.
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    console.error("[recordings-upload] handleUpload error", { message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
