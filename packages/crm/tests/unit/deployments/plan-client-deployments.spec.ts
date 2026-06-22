import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapTemplateTypeToAgent,
  planClientDeployments,
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
