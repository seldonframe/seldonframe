import { and, eq, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { orgMembers, organizations, type OrganizationIntegrations } from "@/db/schema";

function getAppBaseUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
}

function sanitizeReturnTo(value: string | undefined) {
  if (!value || !value.startsWith("/")) {
    return "/settings/integrations";
  }

  return value;
}

async function userCanAccessOrg(userId: string, userOrgId: string | undefined, orgId: string) {
  if (userOrgId && userOrgId === orgId) {
    return true;
  }

  const [memberOrg] = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .limit(1);

  if (memberOrg?.orgId) {
    return true;
  }

  const [managedOrg] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, orgId),
        or(eq(organizations.ownerId, userId), eq(organizations.parentUserId, userId))
      )
    )
    .limit(1);

  return Boolean(managedOrg?.id);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const orgId = request.nextUrl.searchParams.get("state");
  const returnTo = sanitizeReturnTo(request.cookies.get("calendarReturnUrl")?.value);
  const baseUrl = getAppBaseUrl(request);

  if (!code || !orgId) {
    const redirectUrl = `${baseUrl}${returnTo}${returnTo.includes("?") ? "&" : "?"}calendarConnected=0`;
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete("calendarReturnUrl");
    return response;
  }

  const session = await auth();

  if (!session?.user?.id || !(await userCanAccessOrg(session.user.id, session.user.orgId, orgId))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    const redirectUrl = `${baseUrl}${returnTo}${returnTo.includes("?") ? "&" : "?"}calendarConnected=0`;
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete("calendarReturnUrl");
    return response;
  }

  const redirectUri = `${baseUrl}/api/integrations/google-calendar/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokens = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!tokenRes.ok || !tokens.access_token) {
    const redirectUrl = `${baseUrl}${returnTo}${returnTo.includes("?") ? "&" : "?"}calendarConnected=0`;
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete("calendarReturnUrl");
    return response;
  }

  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const integrations = ((org?.integrations ?? {}) as OrganizationIntegrations) || {};
  const existingGoogle = integrations.google ?? { calendarConnected: false };

  await db
    .update(organizations)
    .set({
      integrations: {
        ...integrations,
        google: {
          ...existingGoogle,
          connected: true,
          calendarConnected: true,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? existingGoogle.refreshToken,
          expiresAt:
            typeof tokens.expires_in === "number"
              ? Date.now() + tokens.expires_in * 1000
              : existingGoogle.expiresAt,
          scope: tokens.scope ?? existingGoogle.scope,
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  const redirectUrl = `${baseUrl}${returnTo}${returnTo.includes("?") ? "&" : "?"}calendarConnected=1`;
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.delete("calendarReturnUrl");
  return response;
}
