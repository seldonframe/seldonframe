import { NextRequest, NextResponse } from "next/server";
import { getOrgId } from "@/lib/auth/helpers";

function getAppBaseUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
}

function sanitizeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/")) {
    return "/settings/integrations";
  }

  return value;
}

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();

  if (!orgId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return NextResponse.redirect(new URL("/settings/integrations?calendarConnected=0", request.url));
  }

  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const redirectUri = `${getAppBaseUrl(request)}/api/integrations/google-calendar/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar",
    access_type: "offline",
    prompt: "consent",
    state: orgId,
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  response.cookies.set("calendarReturnUrl", returnTo, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 10,
  });

  return response;
}
