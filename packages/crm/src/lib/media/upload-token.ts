// Media T4 — chat attach/upload token grant decision.
//
// Pure, DI-free helper backing POST /api/v1/workspace/media/upload's
// `onBeforeGenerateToken`. Kept separate from the Vercel Blob
// `handleUpload` plumbing (which needs a live request/session and isn't
// unit-testable in isolation) so the actual security decision has direct
// coverage:
//   - auth REQUIRED (orgId must already be resolved from the session by
//     the caller — this function never trusts a body-supplied orgId,
//     it only checks that one was resolved);
//   - content-type must be in the image OR video allow-list;
//   - size cap is PER-KIND: the 5 MB image cap for an image content type,
//     the 50 MB video cap for a video one — so a client declaring an image
//     never receives the (10× larger) video Blob allowance. Blob still
//     enforces the granted cap server-side against the upload's real bytes.

import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  IMAGE_MAX_BYTES,
} from "@/lib/page-blocks/images";
import {
  ALLOWED_VIDEO_CONTENT_TYPES,
  VIDEO_MAX_BYTES,
} from "@/lib/media/resolve-url";

export type MediaUploadKind = "image" | "video";

export type MediaUploadGrantInput = {
  /** Resolved org id from the session (e.g. getOrgId()). null = no session. */
  orgId: string | null;
  /** Content type the browser is requesting to upload. */
  contentType: string;
};

export type MediaUploadGrantResult =
  | {
      ok: true;
      kind: MediaUploadKind;
      allowedContentTypes: string[];
      maximumSizeInBytes: number;
    }
  | { ok: false; error: "unauthorized" | "content_type_not_allowed" };

/** The full allow-list offered to the Blob client-upload token — both
 *  image and video types, since the chat attach control accepts either. */
export const MEDIA_UPLOAD_ALLOWED_CONTENT_TYPES: readonly string[] = [
  ...ALLOWED_IMAGE_CONTENT_TYPES,
  ...ALLOWED_VIDEO_CONTENT_TYPES,
];

export function decideMediaUploadGrant(
  input: MediaUploadGrantInput,
): MediaUploadGrantResult {
  if (!input.orgId) {
    return { ok: false, error: "unauthorized" };
  }

  const contentType = input.contentType.trim();
  const isImage = (ALLOWED_IMAGE_CONTENT_TYPES as readonly string[]).includes(contentType);
  const isVideo = (ALLOWED_VIDEO_CONTENT_TYPES as readonly string[]).includes(contentType);

  if (!contentType || (!isImage && !isVideo)) {
    return { ok: false, error: "content_type_not_allowed" };
  }

  return {
    ok: true,
    kind: isVideo ? "video" : "image",
    allowedContentTypes: [...MEDIA_UPLOAD_ALLOWED_CONTENT_TYPES],
    // Per-kind cap: an image grant gets the small image limit, a video
    // grant the larger video one — never a shared max (Blob re-checks the
    // upload's real bytes against whichever we return here).
    maximumSizeInBytes: isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES,
  };
}
