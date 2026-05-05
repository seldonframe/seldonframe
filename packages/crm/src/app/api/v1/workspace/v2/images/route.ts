// v1.10.0 — POST /api/v1/workspace/v2/images
//
// Uploads a workspace image (logo or hero background) to Vercel Blob
// and applies the URL to the right place in the data model.
//
// Body: { workspace_id, slot, file_name, content_type, image_data_b64 }
// where image_data_b64 is the file's bytes base64-encoded.
//
// Auth: workspace bearer token (must match workspace_id).
// Validation: content type whitelist, 5 MB max, slot enum, workspace
// existence — all in src/lib/page-blocks/images.ts.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import {
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
};

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as Body;

  const workspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
  const slot = typeof body.slot === "string" ? (body.slot as ImageSlot) : "";
  const fileName =
    typeof body.file_name === "string" ? body.file_name.trim() : "";
  const contentType =
    typeof body.content_type === "string" ? body.content_type.trim() : "";
  const imageDataB64 =
    typeof body.image_data_b64 === "string" ? body.image_data_b64 : "";

  if (!workspaceId || !slot || !fileName || !contentType || !imageDataB64) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_field",
        required: [
          "workspace_id",
          "slot",
          "file_name",
          "content_type",
          "image_data_b64",
        ],
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

  // Decode the base64 payload. Reject early if it's not parseable —
  // saves a round-trip to Vercel Blob with garbage bytes.
  let bytes: Buffer;
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
    },
    { request, orgId: workspaceId, status: 200 },
  );

  return NextResponse.json(result, { status: 200 });
}
