import { and, eq, or } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { orgMembers, organizations } from "@/db/schema";
import type { SeldonRunResult } from "@/lib/ai/seldon-actions";

export type OpenClawCardButton = {
  label: string;
  kind: "link" | "prompt";
  href?: string;
  prompt?: string;
  primary?: boolean;
};

export type OpenClawCard = {
  title: string;
  summary: string;
  previewUrl: string | null;
  buttons: OpenClawCardButton[];
};

export function resolveUserIdFromSeldonApiKey(headers: Headers): string | null {
  const providedKey = headers.get("x-seldon-api-key")?.trim();
  if (!providedKey) {
    return null;
  }

  const configuredPairs = (process.env.SELDON_BUILDER_API_KEYS ?? "")
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf(":");
      if (separator < 1) {
        return null;
      }

      const key = pair.slice(0, separator).trim();
      const userId = pair.slice(separator + 1).trim();
      if (!key || !userId) {
        return null;
      }

      return { key, userId };
    })
    .filter((entry): entry is { key: string; userId: string } => Boolean(entry));

  const match = configuredPairs.find((entry) => entry.key === providedKey);
  return match?.userId ?? null;
}

export async function resolveAuthenticatedBuilderUserId(headers: Headers) {
  const apiKeyUserId = resolveUserIdFromSeldonApiKey(headers);
  const hasApiKeyHeader = Boolean(headers.get("x-seldon-api-key")?.trim());

  if (hasApiKeyHeader && !apiKeyUserId) {
    throw new Error("Invalid x-seldon-api-key.");
  }

  if (apiKeyUserId) {
    return apiKeyUserId;
  }

  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  return session.user.id;
}

export async function requireManagedWorkspaceForUser(workspaceId: string, userId: string) {
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedWorkspaceId) {
    throw new Error("workspaceId is required");
  }

  const [workspace] = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      settings: organizations.settings,
      subscription: organizations.subscription,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, normalizedWorkspaceId),
        or(eq(organizations.ownerId, userId), eq(organizations.parentUserId, userId))
      )
    )
    .limit(1);

  if (workspace?.id) {
    return workspace;
  }

  const [memberWorkspace] = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      settings: organizations.settings,
      subscription: organizations.subscription,
    })
    .from(organizations)
    .innerJoin(orgMembers, eq(orgMembers.orgId, organizations.id))
    .where(and(eq(organizations.id, normalizedWorkspaceId), eq(orgMembers.userId, userId)))
    .limit(1);

  if (!memberWorkspace?.id) {
    throw new Error("Unauthorized");
  }

  return memberWorkspace;
}

export function assertSelfServiceEnabled(workspace: {
  settings: Record<string, unknown> | null;
  subscription: Record<string, unknown> | null;
}) {
  const settings = workspace.settings ?? {};
  const subscription = workspace.subscription ?? {};
  const selfServiceFromSettings =
    settings.selfService &&
    typeof settings.selfService === "object" &&
    Boolean((settings.selfService as Record<string, unknown>).enabled);
  const selfServiceFromSubscription = Boolean(subscription.selfServiceEnabled);

  if (!selfServiceFromSettings && !selfServiceFromSubscription) {
    throw new Error("Self-service is not enabled for this workspace");
  }
}

function normalizeSummary(result: SeldonRunResult) {
  if (result.cardSummary?.trim()) {
    return result.cardSummary.trim();
  }

  if (result.description?.trim()) {
    return result.description.trim();
  }

  return result.summary.split("\n")[0]?.replace(/^[-\s]*/, "") || result.blockName;
}

export function toOpenClawCards(results: SeldonRunResult[]): OpenClawCard[] {
  return results.map((result) => ({
    title: result.blockName,
    summary: normalizeSummary(result),
    previewUrl: result.previewUrl ?? result.publicUrl ?? result.adminUrl ?? null,
    buttons: (result.actions ?? []).map((action) => ({
      label: action.label,
      kind: action.kind,
      href: action.href,
      prompt: action.prompt,
      primary: action.primary,
    })),
  }));
}
