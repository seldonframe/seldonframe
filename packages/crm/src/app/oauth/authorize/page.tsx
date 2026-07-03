import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { oauthClients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseAuthorizeRequest } from "@/lib/oauth/authorize-request";
import { isRedirectUriAllowed } from "@/lib/oauth/redirect-uri";
import { listWorkspacesForUser } from "@/lib/oauth/workspace-picker";

export const dynamic = "force-dynamic";

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.SF_OAUTH_ENABLED !== "true") {
    redirect("/404");
  }

  const resolvedParams = await searchParams;
  const urlSearchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedParams)) {
    if (typeof value === "string") urlSearchParams.set(key, value);
  }

  const parsed = parseAuthorizeRequest(urlSearchParams);
  if (!parsed.ok) {
    // Per MCP spec + design doc §4: an invalid/unrecognized request at this
    // stage gets an IN-PAGE error, never a redirect — we don't yet know
    // whether the redirect_uri is trustworthy at this point in some failure
    // modes (e.g. missing client_id means we can't even look up the
    // allowlist), so redirecting anywhere would risk exactly the open-
    // redirect this design explicitly guards against.
    return <div>Invalid authorization request: {parsed.error}</div>;
  }

  const session = await auth();
  if (!session?.user?.id) {
    const returnTo = `/oauth/authorize?${urlSearchParams.toString()}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(returnTo)}`);
  }

  const [client] = await db
    .select({ redirectUris: oauthClients.redirectUris, clientName: oauthClients.clientName })
    .from(oauthClients)
    .where(eq(oauthClients.clientId, parsed.value.clientId))
    .limit(1);

  if (!client || !isRedirectUriAllowed(parsed.value.redirectUri, client.redirectUris)) {
    // Same in-page-error rule as above — an unregistered or mismatched
    // redirect_uri must NEVER receive an automatic redirect.
    return <div>Unknown client or unregistered redirect_uri.</div>;
  }

  const workspaces = await listWorkspacesForUser(session.user.id);

  return (
    <div>
      <h1>{client.clientName ?? "An application"} wants to access your SeldonFrame workspace</h1>
      {/* MCP spec + Anthropic docs requirement: display the redirect URI hostname
          clearly, with an extra warning if it's loopback-only (design doc §1.1/§1.2). */}
      <p>You will be redirected to: <strong>{new URL(parsed.value.redirectUri).hostname}</strong></p>
      {(new URL(parsed.value.redirectUri).hostname === "localhost" ||
        new URL(parsed.value.redirectUri).hostname === "127.0.0.1") && (
        <p role="alert">This is a local application running on your own device.</p>
      )}
      <form action="/api/oauth/authorize" method="POST">
        <input type="hidden" name="client_id" value={parsed.value.clientId} />
        <input type="hidden" name="redirect_uri" value={parsed.value.redirectUri} />
        <input type="hidden" name="code_challenge" value={parsed.value.codeChallenge} />
        <input type="hidden" name="state" value={parsed.value.state ?? ""} />
        <input type="hidden" name="resource" value={parsed.value.resource ?? ""} />
        <label>
          Workspace:
          <select name="org_id" defaultValue={session.user.orgId}>
            {workspaces.map((ws) => (
              <option key={ws.orgId} value={ws.orgId}>
                {ws.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Approve</button>
      </form>
    </div>
  );
}
