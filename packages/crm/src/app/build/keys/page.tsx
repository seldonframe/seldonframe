// /build/keys — the builder's developer-key panel (spec 1ff09dcb, P0 Task 3).
//
// The SKILL.md funnel points a developer here to mint the wst_ workspace bearer
// their IDE's MCP connector uses. This page REUSES the exact same secure,
// reveal-once key surface as /settings/api (the ApiKeyManager component +
// mintApiKeyAction / revokeApiKeyAction) — no second mint/revoke path — but
// frames it for the builder: a "what to do with this" header + a link back to
// the /build quickstart. Logged-out visitors get a sign-in CTA instead of a hard
// redirect (they may arrive straight from SKILL.md).

import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { KeyRound, ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { auth } from "@/auth";
import { getOrgId } from "@/lib/auth/helpers";
import { ApiKeyManager } from "@/components/settings/api-key-manager";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Developer keys — SeldonFrame for Builders",
  description:
    "Mint the workspace bearer your IDE's MCP connector uses to build, test, and sell agents on SeldonFrame.",
};

export default async function BuildKeysPage() {
  const session = await auth();
  const orgId = session?.user?.id ? await getOrgId() : null;

  const header = (
    <div className="space-y-2">
      <Link
        href="/build"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to the builder quickstart
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Developer keys
      </h1>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Mint a key, copy it once, and paste it into your IDE&apos;s MCP connector
        (<code className="font-mono">Authorization: Bearer wst_…</code>). The
        SeldonFrame MCP then authenticates every build, eval, publish, and
        pricing call as your workspace — so you can build and sell an agent
        without opening a dashboard.
      </p>
    </div>
  );

  if (!orgId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
        {header}
        <div className="rounded-xl border bg-card p-8 text-center space-y-3">
          <KeyRound className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">
            Sign in to mint a developer key
          </p>
          <p className="text-sm text-muted-foreground">
            Your first workspace is free. Sign in (or create one) and your key
            scopes to it automatically.
          </p>
          <Link
            href="/login?callbackUrl=/build/keys"
            className="crm-button-primary inline-flex h-10 items-center px-5"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  // Same query + filter as /settings/api: only operator-minted `user:` keys are
  // listed/revocable here; the internal mcp:device bootstrap token is hidden.
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

  const userKeys = allKeys.filter((k) => k.name?.startsWith("user:"));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      {header}
      <ApiKeyManager
        keys={userKeys.map((k) => ({
          id: k.id,
          name: k.name?.replace(/^user:/, "") ?? "(unnamed)",
          prefix: k.keyPrefix,
          createdAt: k.createdAt.toISOString(),
          expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
          lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
        }))}
      />
    </main>
  );
}
