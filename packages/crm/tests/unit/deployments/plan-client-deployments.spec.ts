import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapTemplateTypeToAgent,
  planClientDeployments,
  runClientDeployments,
  type PlannedClientDeployment,
} from "../../../src/lib/deployments/plan-client-deployments";
import type { AgentTemplate } from "../../../src/db/schema/agent-templates";

// A minimal template factory — only the fields the planner reads.
function tmpl(over: Partial<AgentTemplate> = {}): Pick<
  AgentTemplate,
  "id" | "name" | "type" | "blueprint"
> {
  return {
    id: over.id ?? "tmpl-1",
    name: over.name ?? "Front Desk Receptionist",
    type: (over.type ?? "voice_receptionist") as AgentTemplate["type"],
    blueprint: over.blueprint ?? {},
  };
}

describe("mapTemplateTypeToAgent", () => {
  it("maps voice_receptionist → voice-receptionist / voice", () => {
    assert.deepEqual(mapTemplateTypeToAgent("voice_receptionist"), {
      archetype: "voice-receptionist",
      channel: "voice",
    });
  });
  it("maps chat_assistant → website-chatbot / web_chat", () => {
    assert.deepEqual(mapTemplateTypeToAgent("chat_assistant"), {
      archetype: "website-chatbot",
      channel: "web_chat",
    });
  });
  it("defaults an unknown/legacy type to the voice receptionist", () => {
    assert.deepEqual(mapTemplateTypeToAgent("something_else"), {
      archetype: "voice-receptionist",
      channel: "voice",
    });
  });
});

describe("planClientDeployments", () => {
  it("plans one live agent per client, carrying the mapped archetype/channel + sourceTemplateId", () => {
    const plan = planClientDeployments(tmpl({ type: "chat_assistant" }), ["c1", "c2"], []);
    assert.equal(plan.length, 2);
    for (const p of plan) {
      assert.equal(p.archetype, "website-chatbot");
      assert.equal(p.channel, "web_chat");
      assert.equal(p.status, "live");
      assert.equal(p.name, "Front Desk Receptionist");
      assert.equal(p.sourceTemplateId, "tmpl-1");
    }
    assert.deepEqual(
      plan.map((p) => p.orgId),
      ["c1", "c2"],
    );
  });

  it("IDEMPOTENCY: skips clients that already have an agent from this template", () => {
    const plan = planClientDeployments(tmpl(), ["c1", "c2", "c3"], ["c2"]);
    assert.deepEqual(
      plan.map((p) => p.orgId),
      ["c1", "c3"],
    );
  });

  it("re-deploy with ALL clients already deployed plans nothing", () => {
    const plan = planClientDeployments(tmpl(), ["c1", "c2"], ["c1", "c2"]);
    assert.deepEqual(plan, []);
  });

  it("empty selection plans nothing", () => {
    assert.deepEqual(planClientDeployments(tmpl(), [], []), []);
  });

  it("de-dupes a doubled client id (never plans two agents for one org)", () => {
    const plan = planClientDeployments(tmpl(), ["c1", "c1", "c2"], []);
    assert.deepEqual(
      plan.map((p) => p.orgId),
      ["c1", "c2"],
    );
  });

  it("drops falsy org ids defensively", () => {
    const plan = planClientDeployments(tmpl(), ["c1", "", "c2"], []);
    assert.deepEqual(
      plan.map((p) => p.orgId),
      ["c1", "c2"],
    );
  });

  it("carries template blueprint capabilities/faq/greeting onto each plan item", () => {
    const plan = planClientDeployments(
      tmpl({
        blueprint: {
          capabilities: ["book_appointment", "escalate_to_human"],
          faq: [{ q: "Hours?", a: "9-5" }],
          greeting: "Thanks for calling Acme!",
        },
      }),
      ["c1"],
      [],
    );
    assert.deepEqual(plan[0].capabilities, ["book_appointment", "escalate_to_human"]);
    assert.deepEqual(plan[0].faq, [{ q: "Hours?", a: "9-5" }]);
    assert.equal(plan[0].greeting, "Thanks for calling Acme!");
  });

  it("leaves capabilities/faq/greeting undefined when the blueprint is empty (createAgent applies archetype defaults)", () => {
    const plan = planClientDeployments(tmpl({ blueprint: {} }), ["c1"], []);
    assert.equal(plan[0].capabilities, undefined);
    assert.equal(plan[0].faq, undefined);
    assert.equal(plan[0].greeting, undefined);
  });

  it("treats an empty-array / blank-string blueprint as 'use defaults' (no override with empties)", () => {
    const plan = planClientDeployments(
      tmpl({ blueprint: { capabilities: [], faq: [], greeting: "   " } }),
      ["c1"],
      [],
    );
    assert.equal(plan[0].capabilities, undefined);
    assert.equal(plan[0].faq, undefined);
    assert.equal(plan[0].greeting, undefined);
  });

  it("NEVER puts a soul on the plan item (runtime injects each client's own soul)", () => {
    const plan = planClientDeployments(tmpl(), ["c1"], []);
    assert.equal("soul" in plan[0], false);
  });
});

describe("runClientDeployments", () => {
  const nameById = new Map([
    ["c1", "Acme Plumbing"],
    ["c2", "Bright Dental"],
    ["c3", "Cedar HVAC"],
  ]);

  function planItem(orgId: string): PlannedClientDeployment {
    return {
      orgId,
      name: "Front Desk",
      archetype: "voice-receptionist",
      channel: "voice",
      status: "live",
      sourceTemplateId: "tmpl-1",
    };
  }

  it("creates one agent per planned client and reports them deployed", async () => {
    const created: string[] = [];
    const res = await runClientDeployments({
      targetIds: ["c1", "c2"],
      plan: [planItem("c1"), planItem("c2")],
      alreadyDeployed: new Set(),
      nameById,
      createOne: async (item) => {
        created.push(item.orgId);
        return { ok: true, agentId: `agent-${item.orgId}` };
      },
    });
    assert.deepEqual(created, ["c1", "c2"]);
    assert.deepEqual(res.deployed, [
      { orgId: "c1", orgName: "Acme Plumbing", agentId: "agent-c1" },
      { orgId: "c2", orgName: "Bright Dental", agentId: "agent-c2" },
    ]);
    assert.deepEqual(res.skipped, []);
  });

  it("records already-deployed targets as skipped and never calls createOne for them", async () => {
    const created: string[] = [];
    const res = await runClientDeployments({
      targetIds: ["c1", "c2", "c3"],
      // plan already excludes c2 (the planner did that); runner must still skip it.
      plan: [planItem("c1"), planItem("c3")],
      alreadyDeployed: new Set(["c2"]),
      nameById,
      createOne: async (item) => {
        created.push(item.orgId);
        return { ok: true, agentId: `agent-${item.orgId}` };
      },
    });
    assert.deepEqual(created, ["c1", "c3"]); // c2 never created
    assert.deepEqual(
      res.deployed.map((d) => d.orgId),
      ["c1", "c3"],
    );
    assert.deepEqual(res.skipped, [
      { orgId: "c2", orgName: "Bright Dental", reason: "already_deployed" },
    ]);
  });

  it("soft-fails a client whose createOne returns !ok, without aborting the batch", async () => {
    const res = await runClientDeployments({
      targetIds: ["c1", "c2"],
      plan: [planItem("c1"), planItem("c2")],
      alreadyDeployed: new Set(),
      nameById,
      createOne: async (item) =>
        item.orgId === "c1"
          ? { ok: false, error: "org_not_found" }
          : { ok: true, agentId: "agent-c2" },
    });
    assert.deepEqual(
      res.deployed.map((d) => d.orgId),
      ["c2"],
    ); // batch continued past the failure
    assert.deepEqual(res.skipped, [
      { orgId: "c1", orgName: "Acme Plumbing", reason: "create_failed", error: "org_not_found" },
    ]);
  });

  it("soft-fails a client whose createOne THROWS (captures the message)", async () => {
    const res = await runClientDeployments({
      targetIds: ["c1", "c2"],
      plan: [planItem("c1"), planItem("c2")],
      alreadyDeployed: new Set(),
      nameById,
      createOne: async (item) => {
        if (item.orgId === "c1") throw new Error("db exploded");
        return { ok: true, agentId: "agent-c2" };
      },
    });
    assert.deepEqual(
      res.deployed.map((d) => d.orgId),
      ["c2"],
    );
    assert.equal(res.skipped.length, 1);
    assert.equal(res.skipped[0].reason, "create_failed");
    assert.equal(res.skipped[0].error, "db exploded");
  });

  it("falls back to a generic name when an id is missing from nameById", async () => {
    const res = await runClientDeployments({
      targetIds: ["zz"],
      plan: [planItem("zz")],
      alreadyDeployed: new Set(),
      nameById,
      createOne: async () => ({ ok: true, agentId: "agent-zz" }),
    });
    assert.equal(res.deployed[0].orgName, "Client workspace");
  });
});
