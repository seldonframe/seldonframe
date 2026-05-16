// packages/crm/src/app/api/v1/web/workspaces/create-from-url/route.ts
//
// PATCHED PER PLAN CORRECTION (2026-05-16): wires the REAL primitives:
//   - enforceWorkspaceLimit from @/lib/billing/limits (existing)
//   - createFullWorkspace from @/lib/workspace/create-full (existing)
//   - getOwnedWorkspaceCount from @/lib/web-onboarding/owned-workspace-count (new)
//   - getOperatorByokAnthropicKey from @/lib/web-onboarding/byok-resolver (new, Phase 2)
//   - extractBusinessFactsFromUrl from @/lib/web-onboarding/web-fetch-extractor (new, Task 6.4)
//
// Inline adapters bridge two small signature gaps between the orchestrator's
// RunDeps contract and the real primitives:
//   1. enforceWorkspaceLimit() in lib/billing/limits.ts also requires `userId`;
//      the adapter closes over the session userId.
//   2. getOperatorByokAnthropicKey() takes `{ orgId }` and returns a richer
//      ByokResolverResult ({ key, source: "byok" | "missing" | "undecryptable" });
//      the adapter narrows it down to `{ key, source: "byok" } | null` so the
//      orchestrator's needs_byok branch fires for all non-byok outcomes.

import { auth } from "@/auth";
import { runCreateFromUrl } from "@/lib/web-onboarding/run-create-from-url";
import { enforceWorkspaceLimit } from "@/lib/billing/limits";
import { createFullWorkspace } from "@/lib/workspace/create-full";
import { getOwnedWorkspaceCount } from "@/lib/web-onboarding/owned-workspace-count";
import { getOperatorByokAnthropicKey } from "@/lib/web-onboarding/byok-resolver";
import { extractBusinessFactsFromUrl } from "@/lib/web-onboarding/web-fetch-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await auth();
  const body = (await request.json().catch(() => ({}))) as { url?: unknown };

  // The session callback in lib/auth/config.ts exposes `orgId` (NOT
  // `primaryOrgId`). For this route's purposes the user's primary org IS
  // their `orgId` — a 1:1 mapping per the agency-identity-on-user-record
  // model from the spec. Map it across the wire here so the orchestrator's
  // RunDeps contract stays clean.
  const sessionUser = session?.user?.id
    ? {
        id: session.user.id,
        primaryOrgId:
          (session.user as { orgId?: string | null; primaryOrgId?: string | null }).orgId ??
          (session.user as { primaryOrgId?: string | null }).primaryOrgId ??
          null,
      }
    : null;

  const { stream, headers } = await runCreateFromUrl({
    deps: {
      enforceWorkspaceLimit: (args) =>
        enforceWorkspaceLimit({
          userId: sessionUser?.id ?? "",
          primaryOrgId: args.primaryOrgId,
          ownedWorkspaceCount: args.ownedWorkspaceCount,
        }),
      getOwnedWorkspaceCount,
      getOperatorByokAnthropicKey: async (orgId: string) => {
        const result = await getOperatorByokAnthropicKey({ orgId });
        return result.source === "byok" && result.key
          ? { key: result.key, source: "byok" as const }
          : null;
      },
      extractBusinessFactsFromUrl,
      createFullWorkspace,
      workspaceBaseDomain: process.env.WORKSPACE_BASE_DOMAIN ?? "app.seldonframe.com",
    },
    body: { url: body.url },
    sessionUser,
  });

  return new Response(stream, { headers });
}
