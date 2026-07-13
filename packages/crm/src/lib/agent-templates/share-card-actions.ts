"use server";

// Agent setup mode slice (T5) — the celebration screen's share card:
// mint a PREVIEW (never written to the DB), let the operator review/edit
// the scrubbed step labels, then explicitly Publish (writes the row) or
// leave it alone (nothing public happens). Unpublish deletes the row — the
// public /a/[slug] route then 404s.
//
// Every action org-guards via getOrgId() AND re-checks the template's
// builderOrgId — a foreign templateId can never mint, publish, or read a
// share card for a template this workspace doesn't own. Step labels are
// scrubbed (scrubStepLabel) on preview AND again, defensively, on publish —
// the operator-editable preview text is untrusted input by the time it
// comes back from the client.
//
// DI'd per this repo's convention (mirrors lifecycle-connect-actions.ts /
// set-booking-policy.spec.ts) so the org-guard + scrub-on-publish logic is
// directly unit-testable without a live DB/session.

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentTemplates } from "@/db/schema/agent-templates";
import { shareCards, type ShareCardStep } from "@/db/schema/share-cards";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { findSessionByTemplateId } from "@/lib/recordings/session-store";
import type { FlowModel } from "@/lib/recordings/trace-schema";
import { scrubStepLabel, scrubStepLabels } from "@/lib/share/scrub-step-label";

const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "https://app.seldonframe.com";

// 18 random bytes -> 24-char base64url string (unguessable capability
// token, spec §3's ">=24 chars" floor).
const SLUG_BYTES = 18;

export type OwnedTemplate = { id: string; name: string };

export type ShareCardActionDeps = {
  getOrgId: () => Promise<string | null | undefined>;
  loadOwnedTemplate: (args: { templateId: string; orgId: string }) => Promise<OwnedTemplate | null>;
  loadTemplateSteps: (templateId: string) => Promise<string[]>;
  mintSlug: () => string;
  replaceShareCard: (args: {
    orgId: string;
    templateId: string;
    slug: string;
    steps: ShareCardStep[];
  }) => Promise<void>;
  deleteShareCard: (args: { orgId: string; templateId: string }) => Promise<void>;
  loadShareCardSlug: (args: { orgId: string; templateId: string }) => Promise<string | null>;
};

async function defaultLoadOwnedTemplate(args: { templateId: string; orgId: string }): Promise<OwnedTemplate | null> {
  const [row] = await db
    .select({ id: agentTemplates.id, name: agentTemplates.name, builderOrgId: agentTemplates.builderOrgId })
    .from(agentTemplates)
    .where(eq(agentTemplates.id, args.templateId))
    .limit(1);
  if (!row || row.builderOrgId !== args.orgId) return null;
  return { id: row.id, name: row.name };
}

async function defaultLoadTemplateSteps(templateId: string): Promise<string[]> {
  const session = await findSessionByTemplateId(db, templateId);
  const flowModel = (session?.flowModel as FlowModel | null) ?? null;
  return (flowModel?.steps ?? [])
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((s) => s.intent || s.action);
}

function defaultShareCardActionDeps(): ShareCardActionDeps {
  return {
    getOrgId,
    loadOwnedTemplate: defaultLoadOwnedTemplate,
    loadTemplateSteps: defaultLoadTemplateSteps,
    mintSlug: () => crypto.randomBytes(SLUG_BYTES).toString("base64url"),
    replaceShareCard: async ({ orgId, templateId, slug, steps }) => {
      await db.delete(shareCards).where(and(eq(shareCards.orgId, orgId), eq(shareCards.templateId, templateId)));
      await db.insert(shareCards).values({ orgId, templateId, slug, sanitizedSteps: steps });
    },
    deleteShareCard: async ({ orgId, templateId }) => {
      await db.delete(shareCards).where(and(eq(shareCards.orgId, orgId), eq(shareCards.templateId, templateId)));
    },
    loadShareCardSlug: async ({ orgId, templateId }) => {
      const [row] = await db
        .select({ slug: shareCards.slug })
        .from(shareCards)
        .where(and(eq(shareCards.orgId, orgId), eq(shareCards.templateId, templateId)))
        .limit(1);
      return row?.slug ?? null;
    },
  };
}

export type ShareCardPreviewResult =
  | { ok: true; agentName: string; steps: ShareCardStep[] }
  | { ok: false; error: "unauthorized" | "template_not_found" };

/**
 * Compute (never persist) the scrubbed step labels for the share card
 * preview, from the template's recording-derived flow model when one
 * exists, falling back to a single generic step for a non-recording
 * template. Nothing is written — Publish is the only write path.
 */
export async function previewShareCardAction(
  templateId: string,
  deps: ShareCardActionDeps = defaultShareCardActionDeps(),
): Promise<ShareCardPreviewResult> {
  const orgId = await deps.getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const template = await deps.loadOwnedTemplate({ templateId, orgId });
  if (!template) return { ok: false, error: "template_not_found" };

  const rawLabels = await deps.loadTemplateSteps(templateId);
  const labels = scrubStepLabels(rawLabels.length > 0 ? rawLabels : [`${template.name} runs`]);

  // Preview must equal published (opus review 2026-07-12 #2): the public page
  // scrubs the name at the getPublicShareCard chokepoint, so the preview
  // scrubs identically — the operator approves exactly what will render.
  const previewName = scrubStepLabel(template.name) || "This agent";
  return { ok: true, agentName: previewName, steps: labels.map((label) => ({ label })) };
}

export type PublishShareCardResult =
  | { ok: true; slug: string; url: string }
  | { ok: false; error: "unauthorized" | "template_not_found" | "no_steps" };

/**
 * Write the share_cards row — the ONLY action that makes anything public.
 * Steps are re-scrubbed defensively (the operator may have edited the
 * preview text client-side); publishing replaces any prior card for this
 * template (one live card per template, old slug immediately 404s).
 */
export async function publishShareCardAction(
  templateId: string,
  steps: { label: string }[],
  deps: ShareCardActionDeps = defaultShareCardActionDeps(),
): Promise<PublishShareCardResult> {
  assertWritable();
  const orgId = await deps.getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const template = await deps.loadOwnedTemplate({ templateId, orgId });
  if (!template) return { ok: false, error: "template_not_found" };

  const sanitized: ShareCardStep[] = scrubStepLabels((steps ?? []).map((s) => s.label)).map((label) => ({
    label,
  }));
  if (sanitized.length === 0) return { ok: false, error: "no_steps" };

  const slug = deps.mintSlug();
  await deps.replaceShareCard({ orgId, templateId, slug, steps: sanitized });

  return { ok: true, slug, url: `${APP_ORIGIN}/a/${slug}` };
}

export type UnpublishShareCardResult = { ok: true } | { ok: false; error: "unauthorized" };

/** Delete the share card for this template — the public page 404s. */
export async function unpublishShareCardAction(
  templateId: string,
  deps: ShareCardActionDeps = defaultShareCardActionDeps(),
): Promise<UnpublishShareCardResult> {
  assertWritable();
  const orgId = await deps.getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  await deps.deleteShareCard({ orgId, templateId });
  return { ok: true };
}

export type ShareCardStatusResult = {
  ok: true;
  published: boolean;
  slug: string | null;
  url: string | null;
};

/** Current publish state for this template — drives the panel's
 *  Publish/Unpublish affordance on revisit. */
export async function getShareCardStatusAction(
  templateId: string,
  deps: ShareCardActionDeps = defaultShareCardActionDeps(),
): Promise<ShareCardStatusResult> {
  const orgId = await deps.getOrgId();
  if (!orgId) return { ok: true, published: false, slug: null, url: null };

  const slug = await deps.loadShareCardSlug({ orgId, templateId });
  if (!slug) return { ok: true, published: false, slug: null, url: null };
  return { ok: true, published: true, slug, url: `${APP_ORIGIN}/a/${slug}` };
}
