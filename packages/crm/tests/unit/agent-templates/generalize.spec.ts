import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  proposeTemplateGeneralization,
  applyTemplateGeneralization,
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
});
