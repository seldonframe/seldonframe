// Deployment AI-key runtime resolver — the DB-backed wiring around the pure
// `resolveDeploymentAiKey`.
//
// A marketplace BUYER's deployment runs the BUILDER's (template author's) agent,
// so the LLM key must come from the BUILDER's org — NOT the deployment's
// `builderOrgId` (which, for a BOUGHT agent, is the BUYER). The builder/template
// author is `agentTemplates.builderOrgId` (the deployment points at the template
// via `agentTemplateId`). For an AGENCY deployment the agency owns both, so the
// template's builderOrgId is the agency either way — this chain is correct for
// both buyer- and agency-created deployments.
//
// This resolver:
//   1. reads the deployment's TEMPLATE owner org,
//   2. reads that org's decrypted BYOK keys (resolveOrgProviderKeys),
//   3. runs the pure resolver (builder-key → platform-env → none).
//
// Fail-soft: any DB miss/error degrades to the platform key (or `ready:false` for
// the "isn't ready yet" signal) rather than throwing — a live call must never be
// dropped by key resolution.

import type { Deployment, DeploymentSurface } from "@/db/schema/deployments";
import {
  resolveDeploymentAiKey,
  type DeploymentAiKeySource,
  type DeploymentAiProvider,
} from "@/lib/marketplace/buyer/deployment-ai-key";

export type DeploymentRuntimeKey = {
  provider: DeploymentAiProvider;
  /** The resolved key, or null when none exists (the agent isn't ready). */
  apiKey: string | null;
  source: DeploymentAiKeySource;
  ready: boolean;
};

export type ResolveDeploymentRuntimeKeyDeps = {
  /** The deployment's TEMPLATE author org (agentTemplates.builderOrgId), or null
   *  when the template is missing. */
  getTemplateOwnerOrgId: (agentTemplateId: string) => Promise<string | null>;
  /** That org's decrypted BYOK provider keys. */
  getOrgProviderKeys: (orgId: string) => Promise<{ openai: string; anthropic: string }>;
  /** The platform env keys (injected so the resolver is unit-testable). */
  platform: { openai: string | null; anthropic: string | null };
};

/**
 * Resolve the runtime AI key for a deployment: the BUILDER (template author) org's
 * key for the surface's provider, fail-soft to the platform key, else none. DI'd
 * over the store so it unit-tests with fakes; the default deps below read the real
 * DB + env. Never throws — a resolve error degrades to the platform key path.
 */
export async function resolveDeploymentRuntimeKey(
  deployment: Pick<Deployment, "surface" | "agentTemplateId">,
  deps: ResolveDeploymentRuntimeKeyDeps,
): Promise<DeploymentRuntimeKey> {
  let builderOpenAiKey = "";
  let builderAnthropicKey = "";
  try {
    const ownerOrgId = await deps.getTemplateOwnerOrgId(deployment.agentTemplateId);
    if (ownerOrgId) {
      const keys = await deps.getOrgProviderKeys(ownerOrgId);
      builderOpenAiKey = keys.openai;
      builderAnthropicKey = keys.anthropic;
    }
  } catch {
    // Fall through with empty builder keys → the platform key path.
  }

  const r = resolveDeploymentAiKey({
    surface: deployment.surface as DeploymentSurface,
    builderOpenAiKey,
    builderAnthropicKey,
    platformOpenAiKey: deps.platform.openai,
    platformAnthropicKey: deps.platform.anthropic,
  });
  return { provider: r.provider, apiKey: r.key, source: r.source, ready: r.ready };
}

/** The real DB + env deps. Lazy `import("@/db")` so the pure resolver + its tests
 *  never touch Postgres. */
export function buildDefaultDeploymentRuntimeKeyDeps(): ResolveDeploymentRuntimeKeyDeps {
  return {
    getTemplateOwnerOrgId: async (agentTemplateId) => {
      const { db } = await import("@/db");
      const { agentTemplates } = await import("@/db/schema/agent-templates");
      const { eq } = await import("drizzle-orm");
      const [row] = await db
        .select({ builderOrgId: agentTemplates.builderOrgId })
        .from(agentTemplates)
        .where(eq(agentTemplates.id, agentTemplateId))
        .limit(1);
      return row?.builderOrgId ?? null;
    },
    getOrgProviderKeys: async (orgId) => {
      const { resolveOrgProviderKeys } = await import("@/lib/ai/client");
      return resolveOrgProviderKeys(orgId);
    },
    platform: {
      openai: process.env.OPENAI_API_KEY ?? null,
      anthropic: process.env.ANTHROPIC_API_KEY ?? null,
    },
  };
}
