// packages/crm/src/lib/landing/r1-customize.ts
//
// Core handler for the natural-language R1 landing-page editor.
// Used by BOTH the in-app API route (/api/v1/landing/r1/customize)
// and the MCP tool (customize_landing in skills/mcp-server/src/tools.js).
//
// Design:
//   1. Load the current _r1 payload from landing_pages.blueprintJson.
//   2. Build the customize prompt + call Anthropic.
//   3. Parse + runtime-validate the new payload.
//   4. Snapshot the OLD payload into landing_payload_versions.
//   5. Update landing_pages.blueprintJson with the new payload.
//   6. Return { ok: true, summary, versionId }.

import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { landingPages, landingPayloadVersions, organizations } from "@/db/schema";
import type { AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
import { buildR1CustomizeMessages } from "./r1-customize-prompt";
import type { R1LandingPayload } from "./r1-payload-prompt";

const DEFAULT_MODEL =
  process.env.LANDING_PAYLOAD_MODEL?.trim() || "claude-haiku-4-5";

const MAX_TOKENS = 4096;

const R1_SLUG = "r1";
const R1_STATUS = "published";

// ── Type guard (matches r1-payload-generator.ts) ─────────────────────────────

function isR1LandingPayload(v: unknown): v is R1LandingPayload {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj["hero"] === "object" &&
    obj["hero"] !== null &&
    typeof obj["services"] === "object" &&
    obj["services"] !== null &&
    typeof obj["testimonials"] === "object" &&
    obj["testimonials"] !== null &&
    typeof obj["faq"] === "object" &&
    obj["faq"] !== null &&
    typeof obj["footer"] === "object" &&
    obj["footer"] !== null
  );
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

function pickText(content: Array<{ type: string; text?: string }>): string {
  return content
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("\n")
    .trim();
}

// ── Result types ──────────────────────────────────────────────────────────────

export type CustomizeLandingResult =
  | { ok: true; summary: string; versionId: string }
  | {
      ok: false;
      reason:
        | "no_landing_exists"
        | "llm_failed"
        | "invalid_payload"
        | "auth"
        | "no_ai_key";
      detail?: string;
    };

// ── DB helpers ────────────────────────────────────────────────────────────────

type R1Row = {
  id: string;
  payload: R1LandingPayload;
  archetype: AestheticArchetypeId;
  seo: Record<string, unknown>;
};

async function loadR1Row(workspaceId: string): Promise<R1Row | null> {
  const [row] = await db
    .select({
      id: landingPages.id,
      blueprintJson: landingPages.blueprintJson,
      seo: landingPages.seo,
    })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.orgId, workspaceId),
        eq(landingPages.slug, R1_SLUG),
        eq(landingPages.status, R1_STATUS),
      ),
    )
    .limit(1);

  if (!row || !row.blueprintJson) return null;

  const bjson = row.blueprintJson as Record<string, unknown>;
  if (bjson["_r1"] !== true) return null;

  const payload = bjson["payload"] as R1LandingPayload | undefined;
  const archetype = bjson["archetype"] as AestheticArchetypeId | undefined;

  if (!payload || !archetype) return null;

  return {
    id: row.id,
    payload,
    archetype,
    seo: (row.seo ?? {}) as Record<string, unknown>,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Apply a natural-language instruction to the current R1 landing payload.
 *
 * @param workspaceId - UUID of the organization/workspace.
 * @param instruction - Operator's natural-language edit request.
 * @param userId - UUID of the user performing the edit (for audit).
 * @param byokKey - Anthropic API key to use. Falls back to platform env var.
 */
export async function customizeLandingR1(args: {
  workspaceId: string;
  instruction: string;
  userId: string;
  byokKey: string;
}): Promise<CustomizeLandingResult> {
  const { workspaceId, instruction, userId, byokKey } = args;

  // Step 1: Load current R1 payload.
  const row = await loadR1Row(workspaceId);
  if (!row) {
    return { ok: false, reason: "no_landing_exists" };
  }

  // Step 2: Resolve Anthropic client.
  const apiKey = byokKey.trim() || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: "no_ai_key",
      detail: "No Anthropic API key available for this workspace.",
    };
  }

  const client = new Anthropic({ apiKey });
  const { system, userMessage } = buildR1CustomizeMessages(
    row.payload,
    row.archetype,
    instruction,
  );

  // Step 3: Call LLM.
  let rawText: string;
  try {
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: userMessage }],
    });

    rawText = pickText(
      response.content as Array<{ type: string; text?: string }>,
    );

    if (!rawText) {
      return {
        ok: false,
        reason: "llm_failed",
        detail: `LLM returned no text (stop_reason=${(response as { stop_reason?: string }).stop_reason ?? "?"})`,
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        event: "r1_customize_anthropic_error",
        workspace_id: workspaceId,
        message: message.slice(0, 500),
      }),
    );
    return {
      ok: false,
      reason: "llm_failed",
      detail: message.slice(0, 300),
    };
  }

  // Step 4: Parse + validate.
  const cleaned = stripFences(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      ok: false,
      reason: "invalid_payload",
      detail: `JSON parse failed. Preview: ${cleaned.slice(0, 200)}`,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      ok: false,
      reason: "invalid_payload",
      detail: "LLM output was not a JSON object.",
    };
  }

  const parsedObj = parsed as Record<string, unknown>;
  const summary =
    typeof parsedObj["summary"] === "string"
      ? parsedObj["summary"]
      : "Applied operator instruction.";
  const newPayload = parsedObj["payload"];

  if (!isR1LandingPayload(newPayload)) {
    return {
      ok: false,
      reason: "invalid_payload",
      detail: `New payload failed schema validation. Got: ${JSON.stringify(newPayload).slice(0, 300)}`,
    };
  }

  // Step 5: Insert snapshot of the OLD payload into landing_payload_versions.
  const [versionRow] = await db
    .insert(landingPayloadVersions)
    .values({
      workspaceId,
      payload: row.payload as unknown as Record<string, unknown>,
      instruction,
      summary,
      createdBy: userId,
    })
    .returning({ id: landingPayloadVersions.id });

  const versionId = versionRow?.id;
  if (!versionId) {
    // This is very unlikely but guard it.
    return {
      ok: false,
      reason: "llm_failed",
      detail: "Version row insert did not return an ID.",
    };
  }

  // Step 6: Update landing_pages.blueprintJson with the new payload.
  await db
    .update(landingPages)
    .set({
      blueprintJson: {
        _r1: true,
        archetype: row.archetype,
        tagline: newPayload.hero.tagline,
        payload: newPayload,
      } as unknown as Record<string, unknown>,
      seo: {
        ...row.seo,
        title: `${newPayload.footer.businessName} — ${newPayload.hero.tagline}`,
        description: newPayload.hero.subhead,
        ogImage: newPayload.hero.heroImage?.src ?? row.seo["ogImage"] ?? null,
      } as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(landingPages.orgId, workspaceId),
        eq(landingPages.slug, R1_SLUG),
      ),
    );

  return { ok: true, summary, versionId };
}

// ── Revert helper ─────────────────────────────────────────────────────────────

export type RevertLandingResult =
  | { ok: true; summary: string; versionId: string }
  | {
      ok: false;
      reason: "version_not_found" | "no_landing_exists" | "invalid_payload";
      detail?: string;
    };

/**
 * Revert the R1 landing payload to a prior version's snapshot.
 *
 * A revert creates a NEW versions row (immutable audit log) with the target
 * snapshot and a system-generated instruction string. The landing_pages row is
 * updated to reflect the reverted payload.
 */
export async function revertLandingR1(args: {
  workspaceId: string;
  versionId: string;
  userId: string;
}): Promise<RevertLandingResult> {
  const { workspaceId, versionId, userId } = args;

  // Load the target version.
  const [targetVersion] = await db
    .select({
      id: landingPayloadVersions.id,
      payload: landingPayloadVersions.payload,
      createdAt: landingPayloadVersions.createdAt,
    })
    .from(landingPayloadVersions)
    .where(
      and(
        eq(landingPayloadVersions.id, versionId),
        eq(landingPayloadVersions.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!targetVersion) {
    return { ok: false, reason: "version_not_found" };
  }

  const targetPayload = targetVersion.payload as unknown;
  if (!isR1LandingPayload(targetPayload)) {
    return {
      ok: false,
      reason: "invalid_payload",
      detail: "Stored version payload failed schema validation.",
    };
  }

  // Load the current landing page to verify it exists and get archetype.
  const currentRow = await loadR1Row(workspaceId);
  if (!currentRow) {
    return { ok: false, reason: "no_landing_exists" };
  }

  // Build the revert instruction string.
  const revertedAt = targetVersion.createdAt.toISOString();
  const revertInstruction = `Reverted to version from ${revertedAt}`;
  const revertSummary = `Reverted to version from ${revertedAt}.`;

  // Insert a new versions row with the reverted payload.
  const [newVersionRow] = await db
    .insert(landingPayloadVersions)
    .values({
      workspaceId,
      payload: targetPayload as unknown as Record<string, unknown>,
      instruction: revertInstruction,
      summary: revertSummary,
      createdBy: userId,
    })
    .returning({ id: landingPayloadVersions.id });

  const newVersionId = newVersionRow?.id;
  if (!newVersionId) {
    return {
      ok: false,
      reason: "invalid_payload",
      detail: "New version row insert did not return an ID.",
    };
  }

  // Update landing_pages to the reverted payload.
  await db
    .update(landingPages)
    .set({
      blueprintJson: {
        _r1: true,
        archetype: currentRow.archetype,
        tagline: targetPayload.hero.tagline,
        payload: targetPayload,
      } as unknown as Record<string, unknown>,
      seo: {
        ...currentRow.seo,
        title: `${targetPayload.footer.businessName} — ${targetPayload.hero.tagline}`,
        description: targetPayload.hero.subhead,
        ogImage:
          targetPayload.hero.heroImage?.src ??
          currentRow.seo["ogImage"] ??
          null,
      } as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(landingPages.orgId, workspaceId),
        eq(landingPages.slug, R1_SLUG),
      ),
    );

  return { ok: true, summary: revertSummary, versionId: newVersionId };
}

// ── Version list helper ───────────────────────────────────────────────────────

export type VersionRow = {
  id: string;
  instruction: string | null;
  summary: string | null;
  createdAt: string;
};

/**
 * Return the most recent `limit` versions for a workspace, newest first.
 * Does NOT include the payload blob (that would be expensive for a list).
 */
export async function listLandingVersions(
  workspaceId: string,
  limit = 20,
): Promise<VersionRow[]> {
  // Verify the org exists first (avoids leaking data for invalid IDs).
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);

  if (!org) return [];

  const rows = await db
    .select({
      id: landingPayloadVersions.id,
      instruction: landingPayloadVersions.instruction,
      summary: landingPayloadVersions.summary,
      createdAt: landingPayloadVersions.createdAt,
    })
    .from(landingPayloadVersions)
    .where(eq(landingPayloadVersions.workspaceId, workspaceId))
    .orderBy(landingPayloadVersions.createdAt)
    .limit(limit);

  // Return newest first.
  return rows
    .reverse()
    .map((r) => ({
      id: r.id,
      instruction: r.instruction,
      summary: r.summary,
      createdAt: r.createdAt.toISOString(),
    }));
}
