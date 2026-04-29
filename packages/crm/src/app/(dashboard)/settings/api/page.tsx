import { eq, and, desc } from "drizzle-orm";
import { KeyRound, AlertCircle } from "lucide-react";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { getOrgId, requireAuth } from "@/lib/auth/helpers";
import { isAdminTokenUserId } from "@/lib/auth/admin-token";
import { ApiKeyManager } from "@/components/settings/api-key-manager";

/**
 * P0-4: API key generation + listing.
 *
 * Was: 26-line stub showing only `name · prefix****`.
 * Now: full management UI — operators mint a long-lived workspace
 *      bearer token (works as `SELDONFRAME_API_KEY` for the MCP server
 *      AND as `Authorization: Bearer wst_…` on direct v1 API calls),
 *      with a one-time reveal flow + revoke buttons.
 *
 * The list filters out admin-token entries (name starts with "mcp:")
 * because revoking those mid-session would log the operator out and
 * the dedicated revoke flow handles them safely.
 */
export default async function SettingsApiPage() {
  const session = await requireAuth();
  const orgId = await getOrgId();
  const isGuestAdminToken = isAdminTokenUserId(session.user.id);

  if (!orgId) {
    return (
      <section className="animate-page-enter space-y-4">
        <h1 className="text-lg font-semibold">API Keys</h1>
        <p className="text-sm text-muted-foreground">No active workspace.</p>
      </section>
    );
  }

  const allKeys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
      expiresAt: apiKeys.expiresAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.orgId, orgId), eq(apiKeys.kind, "workspace")))
    .orderBy(desc(apiKeys.createdAt));

  // Surface only operator-minted keys (`user:<name>`) in the table.
  // mcp:anonymous-create / mcp:device tokens are admin-bearer cookies
  // managed by the create_workspace flow + revoke endpoint, not by
  // this page.
  const userKeys = allKeys.filter((k) => k.name?.startsWith("user:"));
  const adminTokenKeys = allKeys.filter((k) => !k.name?.startsWith("user:"));

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">
          API Keys
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Generate workspace bearer tokens for the MCP server (
          <code className="font-mono">SELDONFRAME_API_KEY</code>) or direct API
          access via <code className="font-mono">Authorization: Bearer wst_…</code>.
        </p>
      </div>

      {isGuestAdminToken ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground">You're on a guest admin URL</p>
            <p className="text-muted-foreground mt-1">
              Generating an API key here gives you permanent access that won't
              expire when your admin URL does. Save the key in your password
              manager — we only show it once.
            </p>
          </div>
        </div>
      ) : null}

      <ApiKeyManager keys={userKeys.map((k) => ({
        id: k.id,
        name: k.name?.replace(/^user:/, "") ?? "(unnamed)",
        prefix: k.keyPrefix,
        createdAt: k.createdAt.toISOString(),
        expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
        lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
      }))} />

      {adminTokenKeys.length > 0 ? (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Admin tokens ({adminTokenKeys.length})
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            These are the bearer tokens minted by{" "}
            <code className="font-mono">create_workspace</code> for guest admin-URL
            access. They expire on their own and rotate as needed; managed by the
            MCP server, not from this page.
          </p>
          <ul className="space-y-1.5 text-sm">
            {adminTokenKeys.map((k) => (
              <li
                key={k.id}
                className="flex items-center justify-between rounded-md border border-border/60 bg-background/50 px-3 py-2 text-xs"
              >
                <span className="font-mono text-muted-foreground">
                  {k.keyPrefix}…
                </span>
                <span className="text-muted-foreground">
                  {k.name}
                  {k.expiresAt ? (
                    <span className="ml-2">
                      · expires {new Date(k.expiresAt).toLocaleDateString()}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
