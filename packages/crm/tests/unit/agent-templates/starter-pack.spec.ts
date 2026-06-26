// Starter Pack — TDD for the curated, forkable starter-template registry.
//
// Run: node --import tsx --test tests/unit/agent-templates/starter-pack.spec.ts
// (bare tsx --test does NOT resolve the @/ alias; use node --import tsx)
//
// The registry is a STATIC, additive seed list (mirrors the /automations
// archetype pattern). The hard invariant these tests guard: every starter's
// `blueprint` must pass the REAL TemplateBlueprintPatchSchema (the same schema
// saveAgentTemplateBlueprintAction validates against) AND its capabilities must
// be a subset of the surface's allowed set (capabilitiesForSurface) — so a
// one-click fork can never persist an invalid or surface-illegal blueprint.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  STARTER_TEMPLATES,
  getStarterTemplate,
  type StarterTemplate,
} from "../../../src/lib/agent-templates/starter-pack";
import { TemplateBlueprintPatchSchema } from "../../../src/lib/agent-templates/schema";
import {
  capabilitiesForSurface,
  surfaceForType,
} from "../../../src/lib/agent-templates/store";

const TEMPLATE_TYPES = ["voice_receptionist", "chat_assistant"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Registry shape
// ─────────────────────────────────────────────────────────────────────────────

describe("STARTER_TEMPLATES — registry shape", () => {
  test("is a non-empty array", () => {
    assert.ok(Array.isArray(STARTER_TEMPLATES), "must be an array");
    assert.ok(STARTER_TEMPLATES.length > 0, "must be non-empty");
  });

  test("ships at least the 6 curated starters", () => {
    assert.ok(
      STARTER_TEMPLATES.length >= 6,
      `expected >= 6 starters, got ${STARTER_TEMPLATES.length}`,
    );
  });

  test("every entry has { id, name, category, type, summary, blueprint }", () => {
    for (const s of STARTER_TEMPLATES) {
      assert.ok(typeof s.id === "string" && s.id.length > 0, "id non-empty string");
      assert.ok(typeof s.name === "string" && s.name.length > 0, `name non-empty (${s.id})`);
      assert.ok(
        typeof s.category === "string" && s.category.length > 0,
        `category non-empty (${s.id})`,
      );
      assert.ok(typeof s.type === "string" && s.type.length > 0, `type non-empty (${s.id})`);
      assert.ok(
        typeof s.summary === "string" && s.summary.length > 0,
        `summary non-empty (${s.id})`,
      );
      assert.ok(s.blueprint && typeof s.blueprint === "object", `blueprint object (${s.id})`);
    }
  });

  test("ids are unique", () => {
    const ids = STARTER_TEMPLATES.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate starter id found");
  });

  test("every type is a valid AgentTemplateType", () => {
    for (const s of STARTER_TEMPLATES) {
      assert.ok(
        (TEMPLATE_TYPES as readonly string[]).includes(s.type),
        `type '${s.type}' (${s.id}) must be voice_receptionist|chat_assistant`,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Blueprint validity — the load-bearing guarantee
// ─────────────────────────────────────────────────────────────────────────────

describe("STARTER_TEMPLATES — every blueprint passes the REAL schema", () => {
  test("blueprint passes TemplateBlueprintPatchSchema (the save-path validator)", () => {
    for (const s of STARTER_TEMPLATES) {
      const parsed = TemplateBlueprintPatchSchema.safeParse(s.blueprint);
      assert.equal(
        parsed.success,
        true,
        `'${s.id}' blueprint must pass TemplateBlueprintPatchSchema; got ${
          !parsed.success ? JSON.stringify(parsed.error.issues) : ""
        }`,
      );
    }
  });

  test("customSkillMd is within the 8k schema cap", () => {
    for (const s of STARTER_TEMPLATES) {
      const md = s.blueprint.customSkillMd ?? "";
      assert.ok(
        md.length <= 8000,
        `'${s.id}' customSkillMd is ${md.length} chars (cap 8000)`,
      );
    }
  });

  test("capabilities ⊆ the surface's allowed set (no surface-illegal tool)", () => {
    for (const s of STARTER_TEMPLATES) {
      const allowed = new Set(capabilitiesForSurface(surfaceForType(s.type)));
      for (const cap of s.blueprint.capabilities ?? []) {
        assert.ok(
          allowed.has(cap),
          `'${s.id}' (${s.type}) capability '${cap}' is not allowed for surface '${surfaceForType(
            s.type,
          )}'`,
        );
      }
    }
  });

  test("every starter declares a greeting and a persona script", () => {
    for (const s of STARTER_TEMPLATES) {
      assert.ok(
        (s.blueprint.greeting ?? "").trim().length > 0,
        `'${s.id}' must seed a greeting`,
      );
      assert.ok(
        (s.blueprint.customSkillMd ?? "").trim().length > 0,
        `'${s.id}' must seed a customSkillMd persona`,
      );
    }
  });

  test("every starter seeds 2-3 FAQ stubs", () => {
    for (const s of STARTER_TEMPLATES) {
      const faq = s.blueprint.faq ?? [];
      assert.ok(faq.length >= 2, `'${s.id}' should seed >= 2 faq stubs, got ${faq.length}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// House-style playbook baked into the persona prose
// ─────────────────────────────────────────────────────────────────────────────

describe("STARTER_TEMPLATES — house-style playbook", () => {
  // The voice receptionist is the canonical quote-guard + read-back surface.
  test("the voice receptionist bakes in the quote guard + read-back + take_message", () => {
    const voice = STARTER_TEMPLATES.find((s) => s.type === "voice_receptionist");
    assert.ok(voice, "a voice_receptionist starter must exist");
    const md = (voice as StarterTemplate).blueprint.customSkillMd ?? "";
    assert.match(md, /get_quote_range/, "must reference the quote-guard tool");
    assert.match(md, /read.?back/i, "must enforce a read-back");
    assert.ok(
      (voice as StarterTemplate).blueprint.capabilities?.includes("take_message"),
      "voice receptionist must offer take_message (safe exit)",
    );
  });

  test("a quote/estimate starter wires the get_quote_range guard", () => {
    const quote = STARTER_TEMPLATES.find((s) => /quote|estimate/i.test(s.name));
    assert.ok(quote, "a quote/estimate starter must exist");
    const md = (quote as StarterTemplate).blueprint.customSkillMd ?? "";
    // Quote starters must never invent a firm price — they range it.
    assert.match(md, /never .*firm price|range/i, "must avoid firm prices / use a range");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage — the gap-filling use-cases the plan calls out
// ─────────────────────────────────────────────────────────────────────────────

describe("STARTER_TEMPLATES — coverage", () => {
  test("includes a web/website support chat starter (fills the web-chat gap)", () => {
    const chat = STARTER_TEMPLATES.find(
      (s) => s.type === "chat_assistant" && /chat|support|website/i.test(s.name),
    );
    assert.ok(chat, "a website support chat starter must exist");
  });

  test("includes a lead-qualifier / intake starter (fills the lead-qualifier gap)", () => {
    const lead = STARTER_TEMPLATES.find((s) => /lead|qualif|intake/i.test(s.name));
    assert.ok(lead, "a lead qualifier / intake starter must exist");
  });

  test("includes a booking / reservation concierge starter", () => {
    const booking = STARTER_TEMPLATES.find((s) => /book|reservation|concierge/i.test(s.name));
    assert.ok(booking, "a booking concierge starter must exist");
  });

  test("includes a social content assistant whose summary notes the Postiz connector", () => {
    const social = STARTER_TEMPLATES.find((s) => /social|content/i.test(s.name));
    assert.ok(social, "a social content assistant starter must exist");
    assert.match(
      (social as StarterTemplate).summary,
      /postiz/i,
      "social starter summary must mention connecting Postiz for real publishing",
    );
  });

  // Unified agent model P1 — the two event-triggered, OUTBOUND starters. Unlike
  // every inbound starter above, these carry a blueprint.trigger of kind "event".
  test("includes a review-requester starter wired to booking.completed → sms", () => {
    const review = STARTER_TEMPLATES.find((s) => s.id === "review-requester");
    assert.ok(review, "a review-requester starter must exist");
    assert.deepEqual(
      (review as StarterTemplate).blueprint.trigger,
      { kind: "event", event: "booking.completed", channel: "sms" },
      "review-requester must fire on booking.completed via sms",
    );
    // The persona is the human-facing description (the real copy comes from
    // composeReviewRequest at runtime) — it must describe the Google-review ask.
    assert.match(
      (review as StarterTemplate).blueprint.customSkillMd ?? "",
      /review/i,
      "review-requester persona must describe the review ask",
    );
  });

  test("includes a speed-to-lead starter wired to lead.created → sms", () => {
    const speed = STARTER_TEMPLATES.find((s) => s.id === "speed-to-lead");
    assert.ok(speed, "a speed-to-lead starter must exist");
    assert.deepEqual(
      (speed as StarterTemplate).blueprint.trigger,
      { kind: "event", event: "lead.created", channel: "sms" },
      "speed-to-lead must fire on lead.created via sms",
    );
    assert.match(
      (speed as StarterTemplate).blueprint.customSkillMd ?? "",
      /lead/i,
      "speed-to-lead persona must describe instant new-lead outreach",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getStarterTemplate
// ─────────────────────────────────────────────────────────────────────────────

describe("getStarterTemplate", () => {
  test("returns the starter for a known id", () => {
    const first = STARTER_TEMPLATES[0]!;
    const found = getStarterTemplate(first.id);
    assert.equal(found.id, first.id);
    assert.equal(found.name, first.name);
  });

  test("throws for an unknown id", () => {
    assert.throws(() => getStarterTemplate("does-not-exist"), /unknown starter/i);
  });
});
