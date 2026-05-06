// v1.20.0 — operator portal magic-link verification
//
// Consumes the magic-link token, swaps it for a session cookie,
// redirects to the operator dashboard. Mirrors the customer-portal
// magic verification at /customer/[orgSlug]/magic but produces
// an OPERATOR session (long TTL, full workspace access) instead of
// a customer session (contact-scoped).

import { NextRequest, NextResponse } from "next/server";
import { consumeOperatorMagicLink } from "@/lib/operator-portal/auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await context.params;
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  const redirectTo = request.nextUrl.searchParams.get("redirect")?.trim();

  if (!token) {
    return NextResponse.redirect(
      new URL(`/portal/${orgSlug}/login?error=missing_magic_link`, request.url),
    );
  }

  const result = await consumeOperatorMagicLink({ orgSlug, token });
  if (!result.ok) {
    return NextResponse.redirect(
      new URL(`/portal/${orgSlug}/login?error=invalid_magic_link`, request.url),
    );
  }

  const target =
    redirectTo && redirectTo.startsWith("/")
      ? redirectTo
      : `/portal/${orgSlug}`;
  return NextResponse.redirect(new URL(target, request.url));
}
