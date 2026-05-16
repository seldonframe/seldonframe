// Cut B Phase 7 — POST /api/v1/web/uploads/user-image
//
// Web-session-authed user-scoped image upload. Wraps the same Vercel
// Blob `put` primitive that the existing `upload_workspace_image` MCP
// tool / POST /api/v1/workspace/v2/images route uses (see
// packages/crm/src/lib/page-blocks/images.ts), but:
//
//   - auth via next-auth session (not workspace bearer token)
//   - key shape via buildUserImageKey: `users/{userId}/{slug}` instead
//     of `org/{workspaceId}/images/{slot}/...`
//   - no "slot" concept and no auto-apply to the data model — the
//     /settings/agency-profile form persists the returned URL into
//     users.agency_profile.logo_url via its own server action
//
// Validation reuses the existing workspace-image constants
// (ALLOWED_IMAGE_CONTENT_TYPES, IMAGE_MAX_BYTES) so the two surfaces
// agree on what is and isn't an acceptable image.

import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { buildUserImageKey } from "@/lib/uploads/user-image";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  IMAGE_MAX_BYTES,
} from "@/lib/page-blocks/images";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (
    !ALLOWED_IMAGE_CONTENT_TYPES.includes(
      file.type as (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number]
    )
  ) {
    return NextResponse.json(
      { error: `Unsupported image type. Allowed: ${ALLOWED_IMAGE_CONTENT_TYPES.join(", ")}.` },
      { status: 415 }
    );
  }

  if (file.size > IMAGE_MAX_BYTES) {
    return NextResponse.json(
      { error: `Image must be ${Math.floor(IMAGE_MAX_BYTES / (1024 * 1024))}MB or smaller.` },
      { status: 413 }
    );
  }

  const extension = file.type.split("/")[1] ?? "bin";
  const key = buildUserImageKey({
    userId,
    filename: file.name,
    extension,
  });

  try {
    const blob = await put(key, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false,
    });

    return NextResponse.json({ url: blob.url, key });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed." },
      { status: 500 }
    );
  }
}
