import { NextRequest, NextResponse } from "next/server";
import { establishPortalMagicSession } from "@/lib/portal/auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await context.params;
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  const redirectTo = request.nextUrl.searchParams.get("redirect");

  if (!token) {
    return NextResponse.redirect(new URL(`/portal/${orgSlug}/login?error=missing_magic_link`, request.url));
  }

  try {
    const result = await establishPortalMagicSession({
      orgSlug,
      token,
      redirectTo,
    });

    return NextResponse.redirect(new URL(result.redirectTo, request.url));
  } catch {
    return NextResponse.redirect(new URL(`/portal/${orgSlug}/login?error=invalid_magic_link`, request.url));
  }
}
