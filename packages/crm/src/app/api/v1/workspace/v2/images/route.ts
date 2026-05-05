// v1.10.0 / v1.10.1 — POST /api/v1/workspace/v2/images
//
// Uploads a workspace image (logo or hero background) to Vercel Blob
// and applies the URL to the right place in the data model.
//
// Two input modes (one of these is required):
//   1. image_url    — server fetches the URL directly (v1.10.1, preferred).
//                     Skips base64 entirely. SSRF-guarded, 5MB streamed cap.
//   2. image_data_b64 — bytes base64-encoded into the JSON body.
//                     Backward-compatible v1.10.0 path; still used by the
//                     local_file_path branch on the MCP-client side.
//
// Body shape:
//   { workspace_id, slot,
//     image_url? OR image_data_b64?,
//     file_name?, content_type? } // both auto-derived for image_url
//
// Auth: workspace bearer token (must match workspace_id).
// Validation: content type whitelist, 5 MB max, slot enum, workspace
// existence — all in src/lib/page-blocks/images.ts.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import {
  fetchImageBytesFromUrl,
  uploadAndApplyWorkspaceImage,
  type ImageSlot,
  IMAGE_SLOTS,
  IMAGE_MAX_BYTES,
} from "@/lib/page-blocks/images";

type Body = {
  workspace_id?: unknown;
  slot?: unknown;
  file_name?: unknown;
  content_type?: unknown;
  image_data_b64?: unknown;
  image_url?: unknown;
};

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as Body;

  const workspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
  const slot = typeof body.slot === "string" ? (body.slot as ImageSlot) : "";
  const fileNameInput =
    typeof body.file_name === "string" ? body.file_name.trim() : "";
  const contentTypeInput =
    typeof body.content_type === "string" ? body.content_type.trim() : "";
  const imageDataB64 =
    typeof body.image_data_b64 === "string" ? body.image_data_b64 : "";
  const imageUrl =
    typeof body.image_url === "string" ? body.image_url.trim() : "";

  // Required: workspace_id, slot, AND one of (image_url, image_data_b64).
  if (!workspaceId || !slot || (!imageDataB64 && !imageUrl)) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_field",
        required: [
          "workspace_id",
          "slot",
          "(one of) image_url | image_data_b64",
        ],
      },
      { status: 400 },
    );
  }

  if (imageDataB64 && imageUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "ambiguous_source",
        message:
          "Provide image_url OR image_data_b64, not both. Pick one source.",
      },
      { status: 400 },
    );
  }

  if (!IMAGE_SLOTS.includes(slot as ImageSlot)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_slot",
        valid_slots: IMAGE_SLOTS,
      },
      { status: 400 },
    );
  }

  if (guard.orgId !== workspaceId) {
    return NextResponse.json(
      {
        ok: false,
        error: "workspace_mismatch",
        message: "Bearer token does not match workspace_id.",
      },
      { status: 403 },
    );
  }

  // Resolve (bytes, file_name, content_type) — either from the URL or from
  // the base64 body.
  let bytes: Buffer;
  let fileName: string;
  let contentType: string;

  if (imageUrl) {
    const fetchResult = await fetchImageBytesFromUrl(imageUrl, {
      file_name: fileNameInput || undefined,
      content_type: contentTypeInput || undefined,
    });
    if (!fetchResult.ok) {
      logEvent(
        "v2_upload_image_url_fetch_failed",
        {
          slot,
          image_url: imageUrl,
          error: fetchResult.error,
          validation_errors: fetchResult.validation_errors,
        },
        { request, orgId: workspaceId, status: 422, severity: "warn" },
      );
      return NextResponse.json(fetchResult, { status: 422 });
    }
    bytes = fetchResult.image.bytes;
    fileName = fetchResult.image.file_name;
    contentType = fetchResult.image.content_type;
  } else {
    // image_data_b64 path — original v1.10.0 logic.
    if (!fileNameInput || !contentTypeInput) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_required_field",
          required: ["file_name", "content_type"],
          message:
            "When using image_data_b64, file_name and content_type are required (auto-derivation is image_url-only).",
        },
        { status: 400 },
      );
    }
    try {
      bytes = Buffer.from(imageDataB64, "base64");
    } catch {
      return NextResponse.json(
        { ok: false, error: "invalid_base64" },
        { status: 400 },
      );
    }
    if (bytes.length === 0 || bytes.length > IMAGE_MAX_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: bytes.length === 0 ? "empty_payload" : "payload_too_large",
          max_bytes: IMAGE_MAX_BYTES,
        },
        { status: 413 },
      );
    }
    fileName = fileNameInput;
    contentType = contentTypeInput;
  }

  const result = await uploadAndApplyWorkspaceImage({
    workspace_id: workspaceId,
    slot: slot as ImageSlot,
    file_name: fileName,
    content_type: contentType,
    byte_size: bytes.length,
    bytes,
  });

  if (!result.ok) {
    logEvent(
      "v2_upload_image_failed",
      {
        slot,
        error: result.error,
        validation_errors: result.validation_errors,
        source: imageUrl ? "url" : "base64",
      },
      { request, orgId: workspaceId, status: 422, severity: "warn" },
    );
    return NextResponse.json(result, { status: 422 });
  }

  logEvent(
    "v2_upload_image_succeeded",
    {
      slot,
      bytes: bytes.length,
      content_type: contentType,
      applied_to: result.applied_to,
      source: imageUrl ? "url" : "base64",
    },
    { request, orgId: workspaceId, status: 200 },
  );

  return NextResponse.json(result, { status: 200 });
}
