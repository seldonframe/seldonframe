// POST target of the /oauth/authorize consent form's "Approve" button.
// Re-validates EVERYTHING server-side — the hidden form fields round-tripped
// through the user's browser and are not trusted as-is, only as a cross-
// check against the real oauth_clients row (design doc §4, "code bound to
// client_id + redirect_uri + PKCE").
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { oauthClients, oauthAuthorizationCodes } from "@/db/schema";
import { isRedirectUriAllowed } from "@/lib/oauth/redirect-uri";
import { buildAuthorizationCodeRecord } from "@/lib/oauth/issue-authorization-code";
import { listWorkspacesForUser } from "@/lib/oauth/workspace-picker";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { isAllowedAuthorizeFetchSite } from "@/lib/oauth/fetch-metadata-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.SF_OAUTH_ENABLED !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  // Explicit Fetch Metadata check, on top of (not instead of) the NextAuth
  // SameSite=Lax session cookie. Makes the Lax-cookie CSRF assumption
  // explicit so a future SameSite policy change can't silently reopen
  // one-click consent CSRF. See lib/oauth/fetch-metadata-guard.ts.
  if (!isAllowedAuthorizeFetchSite(request.headers.get("sec-fetch-site"))) {
    return NextResponse.json({ error: "forbidden_cross_site_request" }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "access_denied" }, { status: 401 });
  }

  if (!(await checkRateLimit(`oauth:authorize:${session.user.id}`, 30, 60_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const form = await request.formData();
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const state = String(form.get("state") ?? "");
  const resource = String(form.get("resource") ?? "") || undefined;
  const orgId = String(form.get("org_id") ?? "");

  if (!clientId || !redirectUri || !codeChallenge || !orgId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const [client] = await db
    .select({ redirectUris: oauthClients.redirectUris })
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId))
    .limit(1);

  if (!client || !isRedirectUriAllowed(redirectUri, client.redirectUris)) {
    // Never redirect on a validation failure at this step — same rule as
    // the GET page (design doc §4).
    return NextResponse.json({ error: "invalid_client_or_redirect_uri" }, { status: 400 });
  }

  // Membership check (the plan's Task 11 explicit TODO, resolved here as
  // required, not deferred): the submitted org_id round-tripped through the
  // user's browser as a hidden form field — a page-tamperer could submit an
  // org_id they don't belong to. Verify the session user actually belongs
  // to it via the same query that populated the picker, else a code could
  // be minted for a workspace the user has no membership in.
  const workspaces = await listWorkspacesForUser(session.user.id);
  if (!workspaces.some((ws) => ws.orgId === orgId)) {
    return NextResponse.json({ error: "invalid_org_selection" }, { status: 403 });
  }

  const record = buildAuthorizationCodeRecord({
    clientId,
    redirectUri,
    orgId,
    userId: session.user.id,
    codeChallenge,
    resource,
    now: new Date(),
  });

  await db.insert(oauthAuthorizationCodes).values({
    codeHash: record.codeHash,
    clientId: record.clientId,
    redirectUri: record.redirectUri,
    orgId: record.orgId,
    userId: record.userId,
    codeChallenge: record.codeChallenge,
    resource: record.resource,
    expiresAt: record.expiresAt,
  });

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", record.code);
  if (state) redirectUrl.searchParams.set("state", state);

  return NextResponse.redirect(redirectUrl.toString(), { status: 302 });
}
