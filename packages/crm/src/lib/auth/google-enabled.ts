// packages/crm/src/lib/auth/google-enabled.ts
//
// 2026-07-04 — Pure gate for the "Continue with Google" button on the
// signup/login forms (Task 9, web-activation P2). Mirrors the same
// condition `src/lib/auth/config.ts` already uses to conditionally
// register the Google provider (`if (googleClientId && googleClientSecret)`)
// so the UI never renders a button that would 500 on click when the env
// vars are absent (e.g. local dev, preview envs without Google OAuth
// configured).
//
// Kept as a tiny pure function (env object in, boolean out) rather than
// reading `process.env` directly so it's trivially unit-testable without
// mutating global process.env in tests, and so callers can pass the
// object-literal wrapper convention for process.env when direct access
// trips up the Next.js env typecheck.
export function isGoogleAuthEnabled(env: {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}
