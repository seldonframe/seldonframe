import { randomUUID } from "node:crypto";

// Cut B Phase 7 — extends the existing workspace-image upload primitive
// (packages/crm/src/lib/page-blocks/images.ts) with a user-scoped key
// shape. The actual put-to-storage call is the same — `put` from
// @vercel/blob — but keys live under `users/{userId}/` instead of
// `org/{workspaceId}/images/{slot}/`.
//
// We don't redefine the workspace primitive's slot/validation logic
// because user uploads have a different domain shape: there's no "slot"
// (just one logo per user), no need to apply the URL into the data
// model from inside the primitive (the form's server action does that),
// and the bucket prefix encodes the scope rather than a `scope` arg
// being passed around.

export type BuildUserImageKeyInput = {
  userId: string;
  filename: string;
  extension?: string;
};

function slugifyFilename(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9.\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function buildUserImageKey(input: BuildUserImageKeyInput): string {
  if (!input.userId) {
    throw new Error("buildUserImageKey: userId is required");
  }

  const safeName = slugifyFilename(input.filename || "");
  if (safeName) {
    return `users/${input.userId}/${safeName}`;
  }

  const ext = input.extension?.replace(/^\./, "") ?? "bin";
  const generated = randomUUID().replace(/-/g, "");
  return `users/${input.userId}/upload-${generated}.${ext}`;
}
