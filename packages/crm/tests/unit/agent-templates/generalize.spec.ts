import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  proposeTemplateGeneralization,
  applyTemplateGeneralization,
  shouldWarnPersonalDetails,
  validateTemplateVarValues,
  hasDeclaredTemplateVariables,
  TEMPLATE_VARIABLES_DEPLOY_GUARD_MESSAGE,
  type ProposedSubstitution,
} from "../../../src/lib/agent-templates/generalize";

// ─── proposeTemplateGeneralization (DI'd LLM) ────────────────────────────────

describe("proposeTemplateGeneralization", () => {
  test("empty/blank customSkillMd short-circuits with empty_skill_md (LLM never called)", async () => {
    let called = false;
    const fakeLlm = async () => {
      called = true;
      return [];
    };
    const result = await proposeTemplateGeneralization("   ", fakeLlm);
    assert.deepEqual(result, { ok: false, error: "empty_skill_md" });
    assert.equal(called, false, "the LLM must never be called for blank input");
  });

  test("extracts email/name literals proposed by a well-behaved fake LLM", async () => {
    const proposals: ProposedSubstitution[] = [
      {
        token: "contact_email",
        currentValue: "Dresslikeag@gmail.com",
        description: "The operator's personal email",
        example: "hello@acmeplumbing.test",
      },
    ];
    const fakeLlm = async () => proposals;
    const result = await proposeTemplateGeneralization(
      "Forward interested replies to Dresslikeag@gmail.com.",
      fakeLlm,
    );
    assert.deepEqual(result, { ok: true, proposals });
  });

  test("LLM throwing → explicit llm_failed error, never a silent empty result", async () => {
    const fakeLlm = async () => {
      throw new Error("rate limited");
    };
    const result = await proposeTemplateGeneralization("some skill md", fakeLlm);
    assert.deepEqual(result, { ok: false, error: "llm_failed" });
  });

  test("LLM returning null → explicit malformed_llm_output error", async () => {
    const fakeLlm = async () => null;
    const result = await proposeTemplateGeneralization("some skill md", fakeLlm);
    assert.deepEqual(result, { ok: false, error: "malformed_llm_output" });
  });

  test("LLM returning a non-array → malformed_llm_output", async () => {
    const fakeLlm = async () => ({ not: "an array" }) as unknown as ProposedSubstitution[];
    const result = await proposeTemplateGeneralization("some skill md", fakeLlm);
    assert.deepEqual(result, { ok: false, error: "malformed_llm_output" });
  });

  test("LLM returning a row with a bad token (not snake_case) → malformed_llm_output", async () => {
    const fakeLlm = async () => [
      { token: "Contact Email", currentValue: "x@y.com", description: "d", example: "e" },
    ] as ProposedSubstitution[];
    const result = await proposeTemplateGeneralization("some skill md", fakeLlm);
    assert.deepEqual(result, { ok: false, error: "malformed_llm_output" });
  });

  test("LLM returning a row with an empty currentValue → malformed_llm_output", async () => {
    const fakeLlm = async () => [
      { token: "contact_email", currentValue: "   ", description: "d", example: "e" },
    ] as ProposedSubstitution[];
    const result = await proposeTemplateGeneralization("some skill md", fakeLlm);
    assert.deepEqual(result, { ok: false, error: "malformed_llm_output" });
  });

  test("LLM returning an empty array is a VALID (if unusual) result — no personal details found", async () => {
    const fakeLlm = async () => [];
    const result = await proposeTemplateGeneralization("Be concise and friendly.", fakeLlm);
    assert.deepEqual(result, { ok: true, proposals: [] });
  });
});

// ─── applyTemplateGeneralization (pure, exact-literal, all-or-nothing) ───────

describe("applyTemplateGeneralization", () => {
  test("rewrites a single accepted literal into its {token}, verified by occurrence count", () => {
    const result = applyTemplateGeneralization(
      "Forward interested replies to Dresslikeag@gmail.com immediately.",
      [
        {
          token: "contact_email",
          currentValue: "Dresslikeag@gmail.com",
          description: "The operator's email",
          example: "hi@acme.test",
        },
      ],
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(
        result.customSkillMd,
        "Forward interested replies to {contact_email} immediately.",
      );
      assert.deepEqual(result.templateVariables, [
        { name: "contact_email", description: "The operator's email", example: "hi@acme.test" },
      ]);
      assert.deepEqual(result.backfillValues, { contact_email: "Dresslikeag@gmail.com" });
    }
  });

  test("rewrites MULTIPLE accepted rows in one pass", () => {
    const result = applyTemplateGeneralization(
      "Text yo max check this out to 555-1234 or email max@acme.test.",
      [
        { token: "greeting_phrase", currentValue: "yo max check this out", description: "d", example: "e" },
        { token: "contact_phone", currentValue: "555-1234", description: "d", example: "e" },
        { token: "contact_email", currentValue: "max@acme.test", description: "d", example: "e" },
      ],
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(
        result.customSkillMd,
        "Text {greeting_phrase} to {contact_phone} or email {contact_email}.",
      );
    }
  });

  test("a 0-count literal errors the ROW — never a silent no-op", () => {
    const result = applyTemplateGeneralization("Nothing personal in here.", [
      { token: "contact_email", currentValue: "notfound@nowhere.test", description: "d", example: "e" },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "literal_not_found");
      assert.deepEqual((result as { tokens: string[] }).tokens, ["contact_email"]);
    }
  });

  test("apply is ALL-OR-NOTHING: one row's 0-count failure rejects the WHOLE apply, even when other rows are valid", () => {
    const text = "Contact max@acme.test for details.";
    const result = applyTemplateGeneralization(text, [
      { token: "contact_email", currentValue: "max@acme.test", description: "d", example: "e" },
      { token: "contact_phone", currentValue: "555-0000", description: "d", example: "e" }, // not present
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "literal_not_found");
      assert.deepEqual((result as { tokens: string[] }).tokens, ["contact_phone"]);
    }
    // The valid row must NOT have been partially applied — original text
    // untouched. There is no "customSkillMd" on the error branch to check
    // directly, but the contract is that the caller never receives a
    // half-rewritten string; verify no such field leaks through.
    assert.equal((result as unknown as { customSkillMd?: string }).customSkillMd, undefined);
  });

  test("every occurrence of a literal is replaced (global, not just the first)", () => {
    const result = applyTemplateGeneralization(
      "Call max@acme.test. If no answer, still try max@acme.test again.",
      [{ token: "contact_email", currentValue: "max@acme.test", description: "d", example: "e" }],
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(
        result.customSkillMd,
        "Call {contact_email}. If no answer, still try {contact_email} again.",
      );
    }
  });

  test("a literal containing regex-special characters (., +) is treated LITERALLY, not as a pattern", () => {
    const result = applyTemplateGeneralization(
      "Reach out via max+sales@acme.test or the office line.",
      [{ token: "contact_email", currentValue: "max+sales@acme.test", description: "d", example: "e" }],
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.customSkillMd, "Reach out via {contact_email} or the office line.");
    }
  });

  test("no rows → no_rows error", () => {
    const result = applyTemplateGeneralization("Some text.", []);
    assert.deepEqual(result, { ok: false, error: "no_rows" });
  });

  test("duplicate token names across rows → duplicate_token error, no rewrite", () => {
    const result = applyTemplateGeneralization("max@acme.test and 555-1234", [
      { token: "contact_thing", currentValue: "max@acme.test", description: "d", example: "e" },
      { token: "contact_thing", currentValue: "555-1234", description: "d", example: "e" },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "duplicate_token");
      assert.deepEqual((result as { tokens: string[] }).tokens, ["contact_thing"]);
    }
  });

  test("backfillValues carries the AUTHOR's own current value per token (never-lies back-fill contract)", () => {
    const result = applyTemplateGeneralization("Thanks for calling Max ABC Plumbing!", [
      { token: "business_name", currentValue: "Max ABC Plumbing", description: "d", example: "Acme Co" },
    ]);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.backfillValues, { business_name: "Max ABC Plumbing" });
    }
  });

  // Review non-blocking fix — overlapping/substring literals must never
  // silently emit a declared variable with no placeholder in the text.
  test("overlapping literals (one is a substring of another) REJECT rather than emit a token with no placeholder", () => {
    // "max@x.com" is a substring of "max@x.com." — if row 1 rewrites first,
    // it consumes the shared text, so row 2's naive replace against the
    // now-mutated text would find 0 occurrences. Must reject the WHOLE apply,
    // never silently declare contact_email_dot with nothing to fill it.
    const result = applyTemplateGeneralization(
      "Reach max@x.com or, for billing only, max@x.com. for invoices.",
      [
        { token: "contact_email", currentValue: "max@x.com", description: "d", example: "e" },
        { token: "contact_email_dot", currentValue: "max@x.com.", description: "d", example: "e" },
      ],
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "literal_not_found");
    }
  });

  test("processing the LONGER/more-specific literal first still succeeds (order that doesn't collide)", () => {
    // Same overlapping pair, but ordered so the longer literal is consumed
    // FIRST — the shorter one still has occurrences left afterward, so this
    // should succeed (proves the fix doesn't reject every overlap, only the
    // ones that actually collide at rewrite time).
    const result = applyTemplateGeneralization(
      "Reach max@x.com or, for billing only, max@x.com. for invoices.",
      [
        { token: "contact_email_dot", currentValue: "max@x.com.", description: "d", example: "e" },
        { token: "contact_email", currentValue: "max@x.com", description: "d", example: "e" },
      ],
    );
    assert.equal(result.ok, true);
  });
});

// ─── validateTemplateVarValues (deploy-time REQUIRED-field enforcement) ─────

describe("validateTemplateVarValues", () => {
  test("no declared templateVariables → always valid, regardless of values", () => {
    assert.deepEqual(
      validateTemplateVarValues({ templateVariables: [], values: {} }),
      { ok: true },
    );
    assert.deepEqual(
      validateTemplateVarValues({ templateVariables: null, values: null }),
      { ok: true },
    );
    assert.deepEqual(
      validateTemplateVarValues({ templateVariables: undefined, values: undefined }),
      { ok: true },
    );
  });

  test("all declared variables filled → ok", () => {
    const result = validateTemplateVarValues({
      templateVariables: [{ name: "contact_email" }, { name: "contact_phone" }],
      values: { contact_email: "hi@acme.test", contact_phone: "555-1234" },
    });
    assert.deepEqual(result, { ok: true });
  });

  test("a missing declared variable → rejected with its name", () => {
    const result = validateTemplateVarValues({
      templateVariables: [{ name: "contact_email" }, { name: "contact_phone" }],
      values: { contact_email: "hi@acme.test" },
    });
    assert.deepEqual(result, { ok: false, missing: ["contact_phone"] });
  });

  test("a blank/whitespace-only value counts as missing (never a silent drop at runtime)", () => {
    const result = validateTemplateVarValues({
      templateVariables: [{ name: "contact_email" }],
      values: { contact_email: "   " },
    });
    assert.deepEqual(result, { ok: false, missing: ["contact_email"] });
  });

  test("absent values object with declared variables → all reported missing", () => {
    const result = validateTemplateVarValues({
      templateVariables: [{ name: "contact_email" }, { name: "contact_phone" }],
      values: undefined,
    });
    assert.deepEqual(result, { ok: false, missing: ["contact_email", "contact_phone"] });
  });

  test("extra values not declared by the template are simply ignored", () => {
    const result = validateTemplateVarValues({
      templateVariables: [{ name: "contact_email" }],
      values: { contact_email: "hi@acme.test", unrelated_field: "whatever" },
    });
    assert.deepEqual(result, { ok: true });
  });
});

// ─── hasDeclaredTemplateVariables (review fix — formless-deploy REJECT gate) ─

describe("hasDeclaredTemplateVariables", () => {
  test("true when templateVariables has at least one entry", () => {
    assert.equal(
      hasDeclaredTemplateVariables({ templateVariables: [{ name: "contact_email" }] }),
      true,
    );
  });

  test("false when templateVariables is an empty array", () => {
    assert.equal(hasDeclaredTemplateVariables({ templateVariables: [] }), false);
  });

  test("false when templateVariables is absent/undefined", () => {
    assert.equal(hasDeclaredTemplateVariables({}), false);
    assert.equal(hasDeclaredTemplateVariables(undefined), false);
  });

  test("false when templateVariables is null", () => {
    assert.equal(hasDeclaredTemplateVariables({ templateVariables: null }), false);
  });

  test("false when blueprint itself is null/undefined", () => {
    assert.equal(hasDeclaredTemplateVariables(null), false);
    assert.equal(hasDeclaredTemplateVariables(undefined), false);
  });

  test("the guard message points at the wizard that has the fill form", () => {
    assert.match(TEMPLATE_VARIABLES_DEPLOY_GUARD_MESSAGE, /deploy wizard/);
  });
});

// ─── shouldWarnPersonalDetails (Sell-card nudge heuristic, design item 5) ────

describe("shouldWarnPersonalDetails", () => {
  test("true when customSkillMd contains an operator contact literal and templateVariables is empty", () => {
    const out = shouldWarnPersonalDetails({
      customSkillMd: "Forward interested replies to max@acme.test.",
      templateVariables: [],
      operatorContactLiterals: ["max@acme.test"],
    });
    assert.equal(out, true);
  });

  test("false when the literal isn't present in customSkillMd", () => {
    const out = shouldWarnPersonalDetails({
      customSkillMd: "Be concise and friendly.",
      templateVariables: [],
      operatorContactLiterals: ["max@acme.test"],
    });
    assert.equal(out, false);
  });

  test("false when templateVariables is already non-empty (already generalized once)", () => {
    const out = shouldWarnPersonalDetails({
      customSkillMd: "Forward replies to {contact_email}. Ignore max@acme.test elsewhere.",
      templateVariables: [{ name: "contact_email", description: "d", example: "e" }],
      operatorContactLiterals: ["max@acme.test"],
    });
    assert.equal(out, false);
  });

  test("false when customSkillMd is blank", () => {
    const out = shouldWarnPersonalDetails({
      customSkillMd: "   ",
      templateVariables: [],
      operatorContactLiterals: ["max@acme.test"],
    });
    assert.equal(out, false);
  });

  test("blank/absent operator contact literals never false-positive", () => {
    const out = shouldWarnPersonalDetails({
      customSkillMd: "Some persona script with real content.",
      templateVariables: [],
      operatorContactLiterals: ["", "   ", undefined, null],
    });
    assert.equal(out, false);
  });

  test("true when ANY (not necessarily the first) contact literal matches", () => {
    const out = shouldWarnPersonalDetails({
      customSkillMd: "Call 555-1234 for support.",
      templateVariables: [],
      operatorContactLiterals: ["max@acme.test", "555-1234"],
    });
    assert.equal(out, true);
  });
});
