// packages/crm/src/lib/web-onboarding/url-validator.ts
// Pure validator for the create-from-url endpoint body.
// Regex per spec §"URL validation": /^https?:\/\/[a-z0-9.-]+(\.[a-z]{2,})/i after trim.

export type UrlValidationResult =
  | { ok: true; url: string }
  | { ok: false; code: "invalid_url" };

const URL_PATTERN = /^https?:\/\/[a-z0-9.-]+(\.[a-z]{2,})/i;

export function validateCreateFromUrlInput(raw: unknown): UrlValidationResult {
  if (typeof raw !== "string") {
    return { ok: false, code: "invalid_url" };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, code: "invalid_url" };
  }

  if (!URL_PATTERN.test(trimmed)) {
    return { ok: false, code: "invalid_url" };
  }

  return { ok: true, url: trimmed };
}
