// "Make it fit anybody" — the REAL LLM-backed GeneralizationLlm (parse only —
// no network). Mirrors evals/score-llm.spec.ts's fakeClientReturning pattern.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  makeGeneralizationLlm,
  parseGeneralizationResponse,
} from "../../../src/lib/agent-templates/generalize-llm";

function fakeClientReturning(text: string): ReturnType<
  NonNullable<NonNullable<Parameters<typeof makeGeneralizationLlm>[0]>["getClient"]>
> {
  return {
    messages: {
      create: async () => ({ content: [{ type: "text", text }] }),
    },
  } as unknown as ReturnType<
    NonNullable<NonNullable<Parameters<typeof makeGeneralizationLlm>[0]>["getClient"]>
  >;
}

describe("parseGeneralizationResponse", () => {
  test("parses a clean JSON array of valid rows", () => {
    const rows = parseGeneralizationResponse(
      '[{"token":"contact_email","currentValue":"max@acme.test","description":"d","example":"e"}]',
    );
    assert.deepEqual(rows, [
      { token: "contact_email", currentValue: "max@acme.test", description: "d", example: "e" },
    ]);
  });

  test("strips a ```json fence before parsing", () => {
    const rows = parseGeneralizationResponse(
      '```json\n[{"token":"contact_email","currentValue":"max@acme.test","description":"d","example":"e"}]\n```',
    );
    assert.equal(Array.isArray(rows), true);
    assert.equal(rows?.length, 1);
  });

  test("an empty array is a valid parse result", () => {
    assert.deepEqual(parseGeneralizationResponse("[]"), []);
  });

  test("malformed JSON → null", () => {
    assert.equal(parseGeneralizationResponse("this is not json {oops"), null);
  });

  test("a JSON object (not an array) → null", () => {
    assert.equal(parseGeneralizationResponse('{"token":"x"}'), null);
  });

  test("a row with a bad token shape → null (the whole response is rejected)", () => {
    assert.equal(
      parseGeneralizationResponse(
        '[{"token":"Bad Token","currentValue":"x","description":"d","example":"e"}]',
      ),
      null,
    );
  });

  test("non-string input → null", () => {
    assert.equal(parseGeneralizationResponse(undefined as unknown as string), null);
  });
});

describe("makeGeneralizationLlm", () => {
  test("no client (no key configured) → null, never an empty array", async () => {
    const llm = makeGeneralizationLlm({ getClient: () => null });
    const out = await llm({ customSkillMd: "Forward replies to max@acme.test." });
    assert.equal(out, null);
  });

  test("a fake client returning a valid JSON array → parsed rows", async () => {
    const llm = makeGeneralizationLlm({
      getClient: () =>
        fakeClientReturning(
          '[{"token":"contact_email","currentValue":"max@acme.test","description":"The owner email","example":"hi@acme.test"}]',
        ),
    });
    const out = await llm({ customSkillMd: "Forward replies to max@acme.test." });
    assert.deepEqual(out, [
      {
        token: "contact_email",
        currentValue: "max@acme.test",
        description: "The owner email",
        example: "hi@acme.test",
      },
    ]);
  });

  test("a fake client returning malformed JSON → null (propose's pure core turns this into an explicit error)", async () => {
    const llm = makeGeneralizationLlm({ getClient: () => fakeClientReturning("not json {oops") });
    const out = await llm({ customSkillMd: "some text" });
    assert.equal(out, null);
  });
});
