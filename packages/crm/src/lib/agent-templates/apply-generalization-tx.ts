// "Make it fit anybody" — the DI'd transaction orchestration for
// applyTemplateGeneralization (Task 2). Plain module (NOT "use server") so
// the org-guard + back-fill wiring is unit-testable with fakes, mirroring
// seller-actions.ts's `resolvePublishGuard` DI pattern. The real "use server"
// action (generalize-actions.ts) wires this to a real db.transaction.

import type { AgentBlueprint } from "@/db/schema/agents";
import {
  applyTemplateGeneralization,
  type AcceptedGeneralizationRow,
  type ApplyGeneralizationResult,
} from "./generalize";

/** The author's own existing deployment of the template being generalized —
 *  the one(s) whose live agent behavior must stay byte-identical after the
 *  rewrite (never-lies: generalizing must not change the author's own agent).
 *  `customization` is the raw jsonb (loosely typed here; the caller only
 *  reads/writes the `templateVarValues` sub-key, preserving everything else
 *  verbatim). */
export type AuthorDeployment = {
  id: string;
  customization: Record<string, unknown> | null;
};

export type ApplyGeneralizationTxDeps = {
  /** Load the template's current blueprint, ORG-GUARDED: returns null when the
   *  template doesn't exist OR doesn't belong to `orgId` (mirrors
   *  deployAgentTemplateToClientsAction's ownership check — security invariant:
   *  org-scope every query). */
  loadOwnedTemplate: (args: {
    templateId: string;
    orgId: string;
  }) => Promise<{ id: string; blueprint: AgentBlueprint } | null>;
  /** The author's OWN existing deployments of this template. */
  listAuthorDeployments: (args: {
    orgId: string;
    templateId: string;
  }) => Promise<AuthorDeployment[]>;
  /** Persist the rewritten blueprint AND the back-filled deployments'
   *  customization as ONE atomic unit — a real `db.transaction` in
   *  production; a fake in tests that records what it would have written.
   *  Must not partially apply: either both writes land or neither does. */
  persist: (args: {
    templateId: string;
    nextBlueprint: AgentBlueprint;
    deploymentUpdates: Array<{ id: string; customization: Record<string, unknown> }>;
  }) => Promise<void>;
};

export type ApplyGeneralizationTxResult =
  | { ok: true; templateVariables: NonNullable<AgentBlueprint["templateVariables"]> }
  | { ok: false; error: "unauthorized" | "template_not_found" }
  | Extract<ApplyGeneralizationResult, { ok: false }>;

/**
 * Org-guard + apply + author-deployment back-fill, as one logical unit.
 *
 *   1. Load the template, ORG-GUARDED (unauthorized/not-found if it isn't
 *      this org's).
 *   2. Run the PURE `applyTemplateGeneralization` over the template's current
 *      `customSkillMd` with the operator-confirmed rows. Any pure-core error
 *      (literal_not_found / duplicate_token / no_rows) is returned as-is —
 *      NOTHING is persisted (all-or-nothing carries through the tx layer too).
 *   3. On success, build the next blueprint (customSkillMd rewritten +
 *      templateVariables written) AND the back-fill patch for every one of
 *      the author's OWN existing deployments of this template (merging
 *      `result.backfillValues` into each deployment's
 *      `customization.templateVarValues`, preserving any existing values that
 *      aren't in this generalization pass).
 *   4. `deps.persist` writes both in the SAME transaction — the author's live
 *      agent must never observe a moment where the blueprint is generalized
 *      but their own deployment hasn't been back-filled yet (or vice versa).
 */
export async function applyTemplateGeneralizationTx(
  deps: ApplyGeneralizationTxDeps,
  input: { templateId: string; orgId: string; rows: AcceptedGeneralizationRow[] },
): Promise<ApplyGeneralizationTxResult> {
  const template = await deps.loadOwnedTemplate({
    templateId: input.templateId,
    orgId: input.orgId,
  });
  if (!template) return { ok: false, error: "template_not_found" };

  const currentSkillMd = template.blueprint.customSkillMd ?? "";
  const result = applyTemplateGeneralization(currentSkillMd, input.rows);
  if (!result.ok) return result;

  const nextBlueprint: AgentBlueprint = {
    ...template.blueprint,
    customSkillMd: result.customSkillMd,
    templateVariables: result.templateVariables,
  };

  const authorDeployments = await deps.listAuthorDeployments({
    orgId: input.orgId,
    templateId: input.templateId,
  });
  const deploymentUpdates = authorDeployments.map((d) => {
    const existing = (d.customization ?? {}) as Record<string, unknown>;
    const existingVarValues = (existing.templateVarValues as Record<string, string> | undefined) ?? {};
    return {
      id: d.id,
      customization: {
        ...existing,
        templateVarValues: { ...existingVarValues, ...result.backfillValues },
      },
    };
  });

  await deps.persist({ templateId: input.templateId, nextBlueprint, deploymentUpdates });

  return { ok: true, templateVariables: result.templateVariables };
}
