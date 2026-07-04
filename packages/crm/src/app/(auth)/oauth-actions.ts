"use server";

// packages/crm/src/app/(auth)/oauth-actions.ts
//
// 2026-07-04 — Shared "Continue with Google" server action for both the
// signup and login forms (Task 9, web-activation P2). Lives at the
// (auth) route-group root (not inside signup/ or login/) because both
// forms need the identical action reference passed to `<form action={...}>`.
//
// redirectTo is threaded the SAME way sendMagicLinkAction (signup/actions.ts)
// does: sanitized through the shared `isSafeInternalRedirect` allowlist so a
// hostile hidden-input value can't become an open redirect, falling back to
// /clients/new (the default post-auth landing) when absent/unsafe.
//
// NextAuth's signIn() throws a NEXT_REDIRECT control-flow error on success —
// that must propagate uncaught (Next.js's router intercepts it), so this
// action deliberately has NO try/catch around the signIn call.
import { signIn } from "@/auth";
import { assertWritable } from "@/lib/demo/server";
import { isSafeInternalRedirect } from "@/lib/auth/signup-redirect";

function sanitizeRedirectTo(value: unknown): string {
  return isSafeInternalRedirect(value) ? (value as string).trim() : "/clients/new";
}

export async function googleSignInAction(formData: FormData): Promise<void> {
  assertWritable();

  const redirectTo = sanitizeRedirectTo(formData.get("redirectTo"));

  await signIn("google", { redirectTo });
}
