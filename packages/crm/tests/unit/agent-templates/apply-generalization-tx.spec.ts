import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  applyTemplateGeneralizationTx,
  type ApplyGeneralizationTxDeps,
  type AuthorDeployment,
} from "../../../src/lib/agent-templates/apply-generalization-tx";
import type { AgentBlueprint } from "../../../src/db/schema/agents";

const ORG_ID = "org-1";
const TEMPLATE_ID = "tmpl-1";

function makeDeps(overrides?: {
  blueprint?: AgentBlueprint;
  authorDeployments?: AuthorDeployment[];
  ownerOrgId?: string;
}): ApplyGeneralizationTxDeps & { persistCalls: unknown[] } {
  const persistCalls: unknown[] = [];
  const ownerOrgId = overrides?.ownerOrgId ?? ORG_ID;
  const blueprint: AgentBlueprint = overrides?.blueprint ?? {
    customSkillMd: "Forward interested replies to max@acme.test.",
  };
  const authorDeployments = overrides?.authorDeployments ?? [];

  return {
    persistCalls,
    loadOwnedTemplate: async ({ templateId, orgId }) => {
      if (templateId !== TEMPLATE_ID || orgId !== ownerOrgId) return null;
      return { id: TEMPLATE_ID, blueprint };
    },
    listAuthorDeployments: async () => authorDeployments,
    persist: async (args) => {
      persistCalls.push(args);
    },
  };
}

describe("applyTemplateGeneralizationTx", () => {
  test("unauthorized/not-found: template belongs to a DIFFERENT org → template_not_found, nothing persisted", async () => {
    const deps = makeDeps({ ownerOrgId: "some-other-org" });
    const result = await applyTemplateGeneralizationTx(deps, {
      templateId: TEMPLATE_ID,
      orgId: ORG_ID,
      rows: [{ token: "contact_email", currentValue: "max@acme.test", description: "d", example: "e" }],
    });
    assert.deepEqual(result, { ok: false, error: "template_not_found" });
    assert.equal(deps.persistCalls.length, 0);
  });

  test("pure-core failure (literal not found) propagates, nothing persisted", async () => {
    const deps = makeDeps();
    const result = await applyTemplateGeneralizationTx(deps, {
      templateId: TEMPLATE_ID,
      orgId: ORG_ID,
      rows: [{ token: "contact_phone", currentValue: "555-0000", description: "d", example: "e" }],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "literal_not_found");
    assert.equal(deps.persistCalls.length, 0);
  });

  test("success with NO author deployments: blueprint rewritten, persist called with empty deploymentUpdates", async () => {
    const deps = makeDeps();
    const result = await applyTemplateGeneralizationTx(deps, {
      templateId: TEMPLATE_ID,
      orgId: ORG_ID,
      rows: [{ token: "contact_email", currentValue: "max@acme.test", description: "d", example: "e" }],
    });
    assert.equal(result.ok, true);
    assert.equal(deps.persistCalls.length, 1);
    const call = deps.persistCalls[0] as {
      templateId: string;
      nextBlueprint: AgentBlueprint;
      deploymentUpdates: unknown[];
    };
    assert.equal(call.templateId, TEMPLATE_ID);
    assert.equal(call.nextBlueprint.customSkillMd, "Forward interested replies to {contact_email}.");
    assert.deepEqual(call.nextBlueprint.templateVariables, [
      { name: "contact_email", description: "d", example: "e" },
    ]);
    assert.deepEqual(call.deploymentUpdates, []);
  });

  test("back-fills the author's OWN existing deployment's templateVarValues in the same persist call", async () => {
    const authorDeployments: AuthorDeployment[] = [
      { id: "deploy-1", customization: null },
    ];
    const deps = makeDeps({ authorDeployments });
    const result = await applyTemplateGeneralizationTx(deps, {
      templateId: TEMPLATE_ID,
      orgId: ORG_ID,
      rows: [{ token: "contact_email", currentValue: "max@acme.test", description: "d", example: "e" }],
    });
    assert.equal(result.ok, true);
    const call = deps.persistCalls[0] as { deploymentUpdates: Array<{ id: string; customization: Record<string, unknown> }> };
    assert.deepEqual(call.deploymentUpdates, [
      { id: "deploy-1", customization: { templateVarValues: { contact_email: "max@acme.test" } } },
    ]);
  });

  test("preserves the deployment's EXISTING customization fields + existing templateVarValues not touched by this pass", async () => {
    const authorDeployments: AuthorDeployment[] = [
      {
        id: "deploy-1",
        customization: {
          greeting: "Hey there!",
          templateVarValues: { other_token: "keep-me" },
        },
      },
    ];
    const deps = makeDeps({ authorDeployments });
    const result = await applyTemplateGeneralizationTx(deps, {
      templateId: TEMPLATE_ID,
      orgId: ORG_ID,
      rows: [{ token: "contact_email", currentValue: "max@acme.test", description: "d", example: "e" }],
    });
    assert.equal(result.ok, true);
    const call = deps.persistCalls[0] as { deploymentUpdates: Array<{ id: string; customization: Record<string, unknown> }> };
    assert.deepEqual(call.deploymentUpdates, [
      {
        id: "deploy-1",
        customization: {
          greeting: "Hey there!",
          templateVarValues: { other_token: "keep-me", contact_email: "max@acme.test" },
        },
      },
    ]);
  });

  test("back-fills MULTIPLE author deployments in one persist call", async () => {
    const authorDeployments: AuthorDeployment[] = [
      { id: "deploy-1", customization: null },
      { id: "deploy-2", customization: { greeting: "Hi" } },
    ];
    const deps = makeDeps({ authorDeployments });
    const result = await applyTemplateGeneralizationTx(deps, {
      templateId: TEMPLATE_ID,
      orgId: ORG_ID,
      rows: [{ token: "contact_email", currentValue: "max@acme.test", description: "d", example: "e" }],
    });
    assert.equal(result.ok, true);
    const call = deps.persistCalls[0] as { deploymentUpdates: Array<{ id: string }> };
    assert.equal(call.deploymentUpdates.length, 2);
    assert.deepEqual(
      call.deploymentUpdates.map((d) => d.id),
      ["deploy-1", "deploy-2"],
    );
  });
});
