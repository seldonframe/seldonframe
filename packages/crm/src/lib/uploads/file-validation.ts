// packages/crm/src/lib/uploads/file-validation.ts
//
// Pure helper — no IO, no DB.  Validates an uploaded file candidate against
// a field's accept-list and size cap.  Used by the client-onboarding intake
// upload component (T2) and the blob-upload route (T5).

export type UploadFieldConfig = { accept: string[]; maxSizeMb: number };
export type UploadCandidate = { name: string; sizeBytes: number };
export type UploadValidation = { ok: true } | { ok: false; reason: "type" | "size" };

export function validateUploadField(
  file: UploadCandidate,
  cfg: UploadFieldConfig,
): UploadValidation {
  const lower = file.name.toLowerCase();
  const okType = cfg.accept.some((ext) => lower.endsWith(ext.toLowerCase()));
  if (!okType) return { ok: false, reason: "type" };
  if (file.sizeBytes > cfg.maxSizeMb * 1024 * 1024) return { ok: false, reason: "size" };
  return { ok: true };
}
