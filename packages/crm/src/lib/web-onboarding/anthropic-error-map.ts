// packages/crm/src/lib/web-onboarding/anthropic-error-map.ts
//
// The ONE Anthropic-SDK-error → WebFetchError mapping, shared by
// markdown-extractor.ts and paste-extractor.ts. It used to live as a
// copy-pasted if-chain in each extractor's catch block, which is exactly
// how the 2026-07-16 gap happened: Anthropic reports "Your credit balance
// is too low to access the Anthropic API" as HTTP 400 (invalid_request_error),
// NOT 402/429, so both copies fell through to internal_error and the /try
// UI showed a retryable "Something broke on our end" for a condition no
// retry can fix (observed live: flowtechac.com, status 400, claude-opus-4-7).
// A shared function means the mapping can never drift between extractors.

import { WebFetchError } from "./web-fetch-extractor";

// Substring of Anthropic's out-of-credits error message. The SDK surfaces it
// inside err.message (wrapped in the raw error JSON), so a case-insensitive
// substring test is the reliable detector.
const CREDIT_BALANCE_TOO_LOW = /credit balance is too low/i;

export function mapAnthropicSdkError(err: unknown): WebFetchError {
  const status = (err as { status?: number } | null)?.status;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 401 || status === 403) {
    return new WebFetchError(
      "anthropic_unauthorized",
      "Anthropic rejected the BYOK key.",
      err,
    );
  }
  if (
    status === 402 ||
    status === 429 ||
    (status === 400 && CREDIT_BALANCE_TOO_LOW.test(message))
  ) {
    return new WebFetchError(
      "credits_exhausted",
      "BYOK Anthropic key has no remaining credits.",
      err,
    );
  }
  return new WebFetchError(
    "internal_error",
    err instanceof Error ? err.message : "Anthropic SDK call failed.",
    err,
  );
}
