// ICP-3 — TDD tests for the agent_templates data layer (the Agent Builder).
//
// Covers the THREE pure pieces in isolation (no DB):
//   1. slug generation + per-builder uniqueness (resolveUniqueTemplateSlug)
//   2. default voice_receptionist blueprint construction
//      (buildDefaultTemplateBlueprint) — must match the live voice agent's
//      defaults (capabilities incl. take_message/get_quote_range, greeting,
//      voice).
//   3. the update-patch merge (mergeTemplateBlueprint) — shallow merge, arrays
//      replaced, undefined ignored.
// Plus the createAgentTemplate / updateAgentTemplate orchestration via injected
// deps (DI convention — see agents/voice/voice-agent.spec.ts).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDefaultTemplateBlueprint,
  buildTemplateFromAgent,
  capabilitiesForSurface,
  createAgentTemplate,
  mergeTemplateBlueprint,
  resolveAgentAsTemplate,
  resolveUniqueTemplateSlug,
  slugifyTemplateName,
  surfaceForType,
  templateTypeForAgentChannel,
  updateAgentTemplate,
  ALL_TEMPLATE_CAPABILITIES,
  DEFAULT_CHAT_ASSISTANT_CAPABILITIES,
  DEFAULT_VOICE_RECEPTIONIST_CAPABILITIES,
  type CreateAgentTemplateDeps,
  type ResolveAgentAsTemplateDeps,
  type UpdateAgentTemplateDeps,
} from "../../../src/lib/agent-templates/store";
import type { AgentTemplate } from "../../../src/db/schema/agent-templates";
import type { Agent, AgentBlueprint } from "../../../src/db/schema/agents";

// ---------------------------------------------------------------------
// slugifyTemplateName
// ---------------------------------------------------------------------

describe("slugifyTemplateName", () => {
  test("lowercases, hyphenates, and trims", () => {
    assert.equal(slugifyTemplateName("My Voice Receptionist"), "my-voice-receptionist");
    assert.equal(slugifyTemplateName("  Front  Desk!!  "), "front-desk");
    assert.equal(slugifyTemplateName("HVAC — After Hours"), "hvac-after-hours");
  });

  test("caps at 40 chars", () => {
    const long = "a".repeat(80);
    assert.equal(slugifyTemplateName(long).length, 40);
  });
});

// ---------------------------------------------------------------------
// resolveUniqueTemplateSlug
// ---------------------------------------------------------------------

describe("resolveUniqueTemplateSlug", () => {
  test("first template keeps its name-derived slug (no 'default' rewrite)", () => {
    assert.equal(resolveUniqueTemplateSlug("Front Desk", []), "front-desk");
  });

  test("appends -2, -3 … on collision (per-builder uniqueness)", () => {
    assert.equal(resolveUniqueTemplateSlug("Front Desk", ["front-desk"]), "front-desk-2");
    assert.equal(
      resolveUniqueTemplateSlug("Front Desk", ["front-desk", "front-desk-2"]),
      "front-desk-3",
    );
  });

  test("uniqueness is case-insensitive", () => {
    assert.equal(resolveUniqueTemplateSlug("Front Desk", ["FRONT-DESK"]), "front-desk-2");
  });

  test("blank name falls back to 'template'", () => {
    assert.equal(resolveUniqueTemplateSlug("   ", []), "template");
    assert.equal(resolveUniqueTemplateSlug("!!!", ["template"]), "template-2");
  });
});

// ---------------------------------------------------------------------
// buildDefaultTemplateBlueprint
// ---------------------------------------------------------------------

describe("buildDefaultTemplateBlueprint (voice_receptionist)", () => {
  test("has the voice-receptionist archetype + a greeting + a voice", () => {
    const bp = buildDefaultTemplateBlueprint("voice_receptionist");
    assert.equal(bp.archetype, "voice-receptionist");
    assert.ok(bp.greeting && bp.greeting.length > 0, "must seed a greeting");
    assert.equal(bp.voice, "cedar", "must default the TTS voice to cedar");
    assert.deepEqual(bp.faq, []);
    assert.deepEqual(bp.pricingFacts, []);
  });

  test("seeds the live voice agent's default capabilities (incl. take_message + get_quote_range)", () => {
    const bp = buildDefaultTemplateBlueprint("voice_receptionist");
    // Must match lib/agents/store.ts voice-receptionist defaults exactly.
    assert.deepEqual(bp.capabilities, DEFAULT_VOICE_RECEPTIONIST_CAPABILITIES);
    assert.ok(bp.capabilities?.includes("take_message"), "voice R1 safe-exit tool present");
    assert.ok(bp.capabilities?.includes("get_quote_range"), "voice R1 quote guard present");
    assert.ok(bp.capabilities?.includes("book_appointment"), "booking present");
  });

  test("returns a fresh capabilities array each call (no shared mutation)", () => {
    const a = buildDefaultTemplateBlueprint("voice_receptionist");
    const b = buildDefaultTemplateBlueprint("voice_receptionist");
    a.capabilities?.push("mutated");
    assert.ok(
      !b.capabilities?.includes("mutated"),
      "each blueprint must own its capabilities array",
    );
  });
});

// ---------------------------------------------------------------------
// mergeTemplateBlueprint
// ---------------------------------------------------------------------

describe("mergeTemplateBlueprint", () => {
  const base: AgentBlueprint = {
    archetype: "voice-receptionist",
    capabilities: ["book_appointment"],
    greeting: "Hello!",
    voice: "cedar",
    faq: [{ q: "Hours?", a: "9-5" }],
  };

  test("shallow-merges scalar fields", () => {
    const next = mergeTemplateBlueprint(base, { greeting: "Hi there!" });
    assert.equal(next.greeting, "Hi there!");
    // untouched fields preserved
    assert.equal(next.archetype, "voice-receptionist");
    assert.equal(next.voice, "cedar");
  });

  test("REPLACES arrays (faq/capabilities), does not concat", () => {
    const next = mergeTemplateBlueprint(base, {
      faq: [{ q: "Parking?", a: "Out back" }],
      capabilities: ["escalate_to_human"],
    });
    assert.deepEqual(next.faq, [{ q: "Parking?", a: "Out back" }]);
    assert.deepEqual(next.capabilities, ["escalate_to_human"]);
  });

  test("ignores undefined patch fields (no clobber)", () => {
    const next = mergeTemplateBlueprint(base, { greeting: undefined, voice: "marin" });
    assert.equal(next.greeting, "Hello!", "undefined must not clobber existing greeting");
    assert.equal(next.voice, "marin");
  });

  test("adds customSkillMd (the persona script)", () => {
    const next = mergeTemplateBlueprint(base, { customSkillMd: "You are warm and concise." });
    assert.equal(next.customSkillMd, "You are warm and concise.");
  });

  test("does not mutate the input blueprint", () => {
    const before = JSON.stringify(base);
    mergeTemplateBlueprint(base, { greeting: "changed" });
    assert.equal(JSON.stringify(base), before, "input must be untouched");
  });

  test("null DELETES the key (clear an override → runtime default reapplies)", () => {
    // Outbound-UX F5: flipping "Use smart defaults" back ON sends `null`, which
    // must REMOVE the stored guardrails/verify so defaultGuardrailsForSkill /
    // defaultRubricForSkill apply again — distinct from `undefined` (a no-op).
    const withOverride: AgentBlueprint = {
      ...base,
      guardrails: { enabled: true, maxPerDayPerAgent: 10 },
      verify: { checks: [{ kind: "max_length", max: 100 }] },
    };
    const next = mergeTemplateBlueprint(withOverride, {
      guardrails: null,
      verify: null,
    });
    assert.equal("guardrails" in next, false, "guardrails must be removed");
    assert.equal("verify" in next, false, "verify must be removed");
    // Untouched fields survive the clear.
    assert.equal(next.greeting, "Hello!");
  });
});

// ---------------------------------------------------------------------
// createAgentTemplate (DI)
// ---------------------------------------------------------------------

function fakeTemplate(over: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    id: "tmpl-1",
    builderOrgId: "builder-1",
    name: "Front Desk",
    slug: "front-desk",
    type: "voice_receptionist",
    blueprint: buildDefaultTemplateBlueprint("voice_receptionist"),
    status: "draft",
    evalScore: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe("createAgentTemplate", () => {
  test("inserts a draft row with a unique slug + default blueprint", async () => {
    let inserted: Record<string, unknown> | null = null;
    const deps: CreateAgentTemplateDeps = {
      listSlugs: async () => ["front-desk"], // collision → expect -2
      insert: async (values) => {
        inserted = values as Record<string, unknown>;
        return fakeTemplate({ slug: values.slug, name: values.name });
      },
    };

    const result = await createAgentTemplate({
      builderOrgId: "builder-1",
      name: "Front Desk",
      type: "voice_receptionist",
      deps,
    });

    assert.ok(inserted, "insert must be called");
    const vals = inserted as Record<string, unknown>;
    assert.equal(vals.builderOrgId, "builder-1");
    assert.equal(vals.name, "Front Desk");
    assert.equal(vals.slug, "front-desk-2", "must resolve a unique slug");
    assert.equal(vals.type, "voice_receptionist");
    assert.equal(vals.status, "draft");
    const bp = vals.blueprint as AgentBlueprint;
    assert.equal(bp.archetype, "voice-receptionist");
    assert.ok(bp.capabilities?.includes("take_message"));
    assert.equal(result.slug, "front-desk-2");
  });

  test("trims the name and rejects names under 2 chars", async () => {
    const deps: CreateAgentTemplateDeps = {
      listSlugs: async () => [],
      insert: async (values) => fakeTemplate({ name: values.name }),
    };
    const ok = await createAgentTemplate({
      builderOrgId: "b1",
      name: "  Reception  ",
      type: "voice_receptionist",
      deps,
    });
    assert.equal(ok.name, "Reception");

    await assert.rejects(
      () =>
        createAgentTemplate({ builderOrgId: "b1", name: " x ", type: "voice_receptionist", deps }),
      /at least 2 chars/,
    );
  });

  test("requires a builderOrgId", async () => {
    const deps: CreateAgentTemplateDeps = {
      listSlugs: async () => [],
      insert: async () => fakeTemplate(),
    };
    await assert.rejects(
      () => createAgentTemplate({ builderOrgId: "", name: "Reception", type: "voice_receptionist", deps }),
      /builderOrgId is required/,
    );
  });
});

// ---------------------------------------------------------------------
// surfaceForType
// ---------------------------------------------------------------------

describe("surfaceForType", () => {
  test("voice_receptionist → 'voice'", () => {
    assert.equal(surfaceForType("voice_receptionist"), "voice");
  });

  test("chat_assistant → 'chat'", () => {
    assert.equal(surfaceForType("chat_assistant"), "chat");
  });
});

// ---------------------------------------------------------------------
// buildDefaultTemplateBlueprint (chat_assistant)
// ---------------------------------------------------------------------

describe("buildDefaultTemplateBlueprint (chat_assistant)", () => {
  test("has chat-assistant archetype + chat greeting (no voice key)", () => {
    const bp = buildDefaultTemplateBlueprint("chat_assistant");
    assert.equal(bp.archetype, "chat-assistant");
    assert.equal(bp.greeting, "Hi! How can I help you today?");
    assert.equal(bp.voice, undefined, "voice must be absent for chat archetype");
    assert.deepEqual(bp.faq, []);
    assert.deepEqual(bp.pricingFacts, []);
  });

  test("capabilities deep-equal DEFAULT_CHAT_ASSISTANT_CAPABILITIES", () => {
    const bp = buildDefaultTemplateBlueprint("chat_assistant");
    assert.deepEqual(bp.capabilities, DEFAULT_CHAT_ASSISTANT_CAPABILITIES);
  });

  test("chat capabilities include provide_faq_answer but NOT get_quote_range (voice-only)", () => {
    const bp = buildDefaultTemplateBlueprint("chat_assistant");
    assert.ok(bp.capabilities?.includes("provide_faq_answer"), "chat should include provide_faq_answer");
    assert.ok(!bp.capabilities?.includes("get_quote_range"), "chat must not have get_quote_range (voice-only)");
  });

  test("chat blueprint is a fresh array each call (no shared mutation)", () => {
    const a = buildDefaultTemplateBlueprint("chat_assistant");
    const b = buildDefaultTemplateBlueprint("chat_assistant");
    a.capabilities?.push("mutated");
    assert.ok(!b.capabilities?.includes("mutated"), "each blueprint owns its array");
  });
});

// ---------------------------------------------------------------------
// voice_receptionist regression (after generalization)
// ---------------------------------------------------------------------

describe("buildDefaultTemplateBlueprint (voice_receptionist regression)", () => {
  test("still has archetype voice-receptionist + voice cedar + get_quote_range", () => {
    const bp = buildDefaultTemplateBlueprint("voice_receptionist");
    assert.equal(bp.archetype, "voice-receptionist");
    assert.equal(bp.voice, "cedar");
    assert.ok(bp.capabilities?.includes("get_quote_range"));
    assert.ok(bp.capabilities?.includes("take_message"));
  });
});

// ---------------------------------------------------------------------
// ALL_TEMPLATE_CAPABILITIES
// ---------------------------------------------------------------------

describe("ALL_TEMPLATE_CAPABILITIES", () => {
  test("includes voice-only capability get_quote_range", () => {
    assert.ok(ALL_TEMPLATE_CAPABILITIES.includes("get_quote_range"));
  });

  test("includes chat-only capability provide_faq_answer", () => {
    assert.ok(ALL_TEMPLATE_CAPABILITIES.includes("provide_faq_answer"));
  });

  test("is de-duplicated (no repeats)", () => {
    assert.equal(new Set(ALL_TEMPLATE_CAPABILITIES).size, ALL_TEMPLATE_CAPABILITIES.length);
  });
});

// ---------------------------------------------------------------------
// capabilitiesForSurface
// ---------------------------------------------------------------------

describe("capabilitiesForSurface", () => {
  test("voice → voice-receptionist caps (incl. get_quote_range, NOT provide_faq_answer)", () => {
    const caps = capabilitiesForSurface("voice");
    assert.deepEqual(caps, DEFAULT_VOICE_RECEPTIONIST_CAPABILITIES);
    assert.ok(caps.includes("get_quote_range"), "voice must offer get_quote_range");
    assert.ok(
      !caps.includes("provide_faq_answer"),
      "voice must NOT offer provide_faq_answer (chat-only)",
    );
  });

  test("chat → chat-assistant caps (incl. provide_faq_answer, NOT get_quote_range)", () => {
    const caps = capabilitiesForSurface("chat");
    assert.deepEqual(caps, DEFAULT_CHAT_ASSISTANT_CAPABILITIES);
    assert.ok(caps.includes("provide_faq_answer"), "chat must offer provide_faq_answer");
    assert.ok(
      !caps.includes("get_quote_range"),
      "chat must NOT offer get_quote_range (voice-only)",
    );
  });

  test("sms + email → the SAME chat-assistant caps (text surfaces reason like chat)", () => {
    // Multi-surface runtime: an SMS / email agent reasons in text exactly like
    // the web chatbot, so it shares the chat capability set (and excludes the
    // voice-only get_quote_range read-back guard).
    for (const surface of ["sms", "email"] as const) {
      const caps = capabilitiesForSurface(surface);
      assert.deepEqual(
        caps,
        DEFAULT_CHAT_ASSISTANT_CAPABILITIES,
        `${surface} must use the chat-assistant caps`,
      );
      assert.ok(caps.includes("provide_faq_answer"), `${surface} offers provide_faq_answer`);
      assert.ok(
        !caps.includes("get_quote_range"),
        `${surface} must NOT offer get_quote_range (voice-only)`,
      );
    }
  });

  test("returns a fresh array each call (caller may mutate without leaking)", () => {
    const a = capabilitiesForSurface("voice");
    const b = capabilitiesForSurface("voice");
    a.push("mutated");
    assert.ok(!b.includes("mutated"), "each call must own its array");
  });
});

// ---------------------------------------------------------------------
// updateAgentTemplate (DI)
// ---------------------------------------------------------------------

describe("updateAgentTemplate", () => {
  test("merge-patches the blueprint and persists blueprint + updatedAt", async () => {
    const current = fakeTemplate({
      blueprint: {
        archetype: "voice-receptionist",
        greeting: "Old greeting",
        voice: "cedar",
        faq: [],
        capabilities: ["book_appointment"],
      },
    });

    let updateArgs: { id: string; patch: Record<string, unknown> } | null = null;
    const deps: UpdateAgentTemplateDeps = {
      findById: async () => current,
      update: async (id, patch) => {
        updateArgs = { id, patch: patch as Record<string, unknown> };
        return fakeTemplate({ blueprint: (patch.blueprint ?? {}) as AgentBlueprint });
      },
    };

    const result = await updateAgentTemplate({
      id: "tmpl-1",
      patch: { greeting: "New greeting", customSkillMd: "Be concise." },
      deps,
    });

    assert.equal(result.ok, true);
    assert.ok(updateArgs, "update must be called");
    const args = updateArgs as { id: string; patch: Record<string, unknown> };
    assert.equal(args.id, "tmpl-1");
    const savedBp = args.patch.blueprint as AgentBlueprint;
    assert.equal(savedBp.greeting, "New greeting", "greeting patched");
    assert.equal(savedBp.customSkillMd, "Be concise.", "persona script added");
    assert.equal(savedBp.voice, "cedar", "untouched field preserved");
    assert.deepEqual(savedBp.capabilities, ["book_appointment"], "untouched array preserved");
    assert.ok(args.patch.updatedAt instanceof Date, "updatedAt bumped");
  });

  test("returns template_not_found when the row is missing", async () => {
    const deps: UpdateAgentTemplateDeps = {
      findById: async () => null,
      update: async () => {
        throw new Error("update should not be called");
      },
    };
    const result = await updateAgentTemplate({ id: "nope", patch: { greeting: "x" }, deps });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "template_not_found");
  });
});

// ---------------------------------------------------------------------
// templateTypeForAgentChannel + buildTemplateFromAgent
// (product-gap fix: workspace-built agents are valid deploy sources)
// ---------------------------------------------------------------------

describe("templateTypeForAgentChannel", () => {
  test("channel:'voice' → voice_receptionist", () => {
    assert.equal(templateTypeForAgentChannel("voice"), "voice_receptionist");
  });

  test("channel:'web_chat' → chat_assistant", () => {
    assert.equal(templateTypeForAgentChannel("web_chat"), "chat_assistant");
  });

  test("channel:'sms' → chat_assistant (sms shares the chat capability set — no dedicated sms template type)", () => {
    assert.equal(templateTypeForAgentChannel("sms"), "chat_assistant");
  });

  test("channel:'email' → chat_assistant (same reasoning as sms)", () => {
    assert.equal(templateTypeForAgentChannel("email"), "chat_assistant");
  });

  test("an unrecognized/future channel string falls back to chat_assistant (never throws)", () => {
    assert.equal(templateTypeForAgentChannel("carrier_pigeon"), "chat_assistant");
  });
});

describe("buildTemplateFromAgent", () => {
  function fakeAgent(over: Partial<Agent> = {}): Pick<Agent, "orgId" | "name" | "channel" | "blueprint" | "id"> {
    return {
      id: "agent-1",
      orgId: "org-1",
      name: "Front Desk Bot",
      channel: "voice",
      blueprint: {
        archetype: "voice-receptionist",
        greeting: "Thanks for calling!",
        capabilities: ["book_appointment", "take_message"],
      },
      ...over,
    };
  }

  test("maps orgId → builderOrgId, name verbatim, status always 'draft'", () => {
    const args = buildTemplateFromAgent(fakeAgent());
    assert.equal(args.builderOrgId, "org-1");
    assert.equal(args.name, "Front Desk Bot");
    assert.equal(args.status, "draft");
  });

  test("derives type from channel via templateTypeForAgentChannel", () => {
    assert.equal(buildTemplateFromAgent(fakeAgent({ channel: "voice" })).type, "voice_receptionist");
    assert.equal(buildTemplateFromAgent(fakeAgent({ channel: "web_chat" })).type, "chat_assistant");
  });

  test("stamps blueprint.sourceAgentId with the agent's id (the idempotency marker)", () => {
    const args = buildTemplateFromAgent(fakeAgent({ id: "agent-42" }));
    assert.equal(args.blueprint.sourceAgentId, "agent-42");
  });

  test("carries the agent's own blueprint fields through (greeting, capabilities, …)", () => {
    const args = buildTemplateFromAgent(fakeAgent());
    assert.equal(args.blueprint.greeting, "Thanks for calling!");
    assert.deepEqual(args.blueprint.capabilities, ["book_appointment", "take_message"]);
    assert.equal(args.blueprint.archetype, "voice-receptionist");
  });

  test("blueprint is a DEFENSIVE COPY — mutating the returned template's blueprint never reaches back into the agent's own blueprint object", () => {
    const agent = fakeAgent();
    const args = buildTemplateFromAgent(agent);
    (args.blueprint.capabilities as string[]).push("mutated");
    assert.deepEqual(agent.blueprint?.capabilities, ["book_appointment", "take_message"], "the source agent's blueprint must be untouched");
  });

  test("a null/undefined agent blueprint produces an empty-plus-stamp blueprint (never throws)", () => {
    const args = buildTemplateFromAgent(fakeAgent({ blueprint: undefined as unknown as AgentBlueprint }));
    assert.equal(args.blueprint.sourceAgentId, "agent-1");
    assert.equal(args.blueprint.greeting, undefined);
  });
});

// ---------------------------------------------------------------------
// resolveAgentAsTemplate (DI'd orchestration)
// (product-gap fix: workspace-built agents are valid deploy sources)
// ---------------------------------------------------------------------

describe("resolveAgentAsTemplate", () => {
  function fakeAgentRow(over: Partial<Agent> = {}): Pick<Agent, "id" | "orgId" | "name" | "channel" | "blueprint"> {
    return {
      id: "agent-1",
      orgId: "org-1",
      name: "Front Desk Bot",
      channel: "voice",
      blueprint: { archetype: "voice-receptionist", greeting: "Hi!" },
      ...over,
    };
  }

  test("agent found in org, no existing template ⇒ generates + inserts a NEW template stamped with sourceAgentId, resolves a unique slug", async () => {
    let insertedValues: Record<string, unknown> | null = null;
    const deps: ResolveAgentAsTemplateDeps = {
      findAgentInOrg: async (orgId, agentId) => {
        assert.equal(orgId, "org-1");
        assert.equal(agentId, "agent-1");
        return fakeAgentRow();
      },
      findTemplateBySourceAgentId: async () => null, // no prior generation
      listSlugs: async () => ["front-desk-bot"], // force a collision → -2
      insert: async (values) => {
        insertedValues = values as unknown as Record<string, unknown>;
        return fakeTemplate({ ...values, id: "tmpl-generated-1" });
      },
    };

    const result = await resolveAgentAsTemplate("org-1", "agent-1", deps);

    assert.ok(result, "must resolve a template");
    assert.equal(result?.id, "tmpl-generated-1");
    assert.ok(insertedValues, "insert must be called");
    const values = insertedValues as unknown as Record<string, unknown>;
    assert.equal(values.builderOrgId, "org-1");
    assert.equal(values.type, "voice_receptionist");
    assert.equal(values.status, "draft");
    assert.equal(values.slug, "front-desk-bot-2", "collision resolved via resolveUniqueTemplateSlug");
    const blueprint = values.blueprint as AgentBlueprint;
    assert.equal(blueprint.sourceAgentId, "agent-1", "idempotency stamp present");
    assert.equal(blueprint.greeting, "Hi!", "agent's own blueprint fields carried through");
  });

  test("repeat call for the SAME (orgId, agentId) ⇒ REUSES the existing generated template, never calls insert again (idempotent — no duplicate templates on repeat deploy)", async () => {
    let insertCalled = false;
    const existing = fakeTemplate({
      id: "tmpl-generated-1",
      blueprint: { archetype: "voice-receptionist", sourceAgentId: "agent-1" },
    });
    const deps: ResolveAgentAsTemplateDeps = {
      findAgentInOrg: async () => fakeAgentRow(),
      findTemplateBySourceAgentId: async (orgId, agentId) => {
        assert.equal(orgId, "org-1");
        assert.equal(agentId, "agent-1");
        return existing;
      },
      listSlugs: async () => {
        throw new Error("listSlugs should not be called on the reuse path");
      },
      insert: async () => {
        insertCalled = true;
        throw new Error("insert should not be called on the reuse path");
      },
    };

    const result = await resolveAgentAsTemplate("org-1", "agent-1", deps);

    assert.equal(insertCalled, false, "a repeat deploy must reuse, not duplicate, the generated template");
    assert.equal(result?.id, "tmpl-generated-1");
    assert.deepEqual(result, existing);
  });

  test("agent id exists but belongs to a DIFFERENT org ⇒ resolves to null (never leaks cross-org existence, never generates a template from another org's agent)", async () => {
    let findTemplateCalled = false;
    let insertCalled = false;
    const deps: ResolveAgentAsTemplateDeps = {
      // Mirrors the real org-scoped WHERE clause: an agent belonging to
      // "org-2" queried under "org-1" must resolve to null, identical to a
      // wholly nonexistent id.
      findAgentInOrg: async (orgId, agentId) => {
        assert.equal(orgId, "org-1");
        assert.equal(agentId, "agent-owned-by-org-2");
        return null;
      },
      findTemplateBySourceAgentId: async () => {
        findTemplateCalled = true;
        return null;
      },
      listSlugs: async () => [],
      insert: async () => {
        insertCalled = true;
        throw new Error("insert should not be called for a cross-org agent id");
      },
    };

    const result = await resolveAgentAsTemplate("org-1", "agent-owned-by-org-2", deps);

    assert.equal(result, null, "a cross-org agent id must resolve to null, same as a nonexistent id");
    assert.equal(insertCalled, false);
    // findTemplateBySourceAgentId is a short-circuit optimization detail, not a
    // guaranteed no-call — but insert (the only side effect) must never fire.
    void findTemplateCalled;
  });

  test("agent id does not exist at all ⇒ resolves to null (the caller falls through to template_not_found, byte-identical to a nonexistent templateId)", async () => {
    const deps: ResolveAgentAsTemplateDeps = {
      findAgentInOrg: async () => null,
      findTemplateBySourceAgentId: async () => {
        throw new Error("should not be reached — findAgentInOrg already missed");
      },
      listSlugs: async () => [],
      insert: async () => {
        throw new Error("should not be reached — findAgentInOrg already missed");
      },
    };

    const result = await resolveAgentAsTemplate("org-1", "nope", deps);
    assert.equal(result, null);
  });

  test("derives the template TYPE from the agent's channel (voice → voice_receptionist, web_chat → chat_assistant) via templateTypeForAgentChannel", async () => {
    const cases: Array<[string, "voice_receptionist" | "chat_assistant"]> = [
      ["voice", "voice_receptionist"],
      ["web_chat", "chat_assistant"],
      ["sms", "chat_assistant"],
    ];
    for (const [channel, expectedType] of cases) {
      let insertedType: string | null = null;
      const deps: ResolveAgentAsTemplateDeps = {
        findAgentInOrg: async () => fakeAgentRow({ channel }),
        findTemplateBySourceAgentId: async () => null,
        listSlugs: async () => [],
        insert: async (values) => {
          insertedType = values.type as string;
          return fakeTemplate({ ...values, id: "tmpl-x" });
        },
      };
      await resolveAgentAsTemplate("org-1", "agent-1", deps);
      assert.equal(insertedType, expectedType, `channel:'${channel}'`);
    }
  });
});
