import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { parseGenerateBody } from "../../../../src/app/api/v1/agents/generate/route";

describe("parseGenerateBody — POST /api/v1/agents/generate input", () => {
  test("valid description parses", () => {
    const r = parseGenerateBody({ description: "a google review requester for a dentist" });
    assert.deepEqual(r, { ok: true, description: "a google review requester for a dentist", reviewUrl: undefined });
  });

  test("trims description; whitespace-only is rejected (→ 400 branch)", () => {
    assert.deepEqual(parseGenerateBody({ description: "   " }), { ok: false });
    assert.deepEqual(parseGenerateBody({ description: "  build a speed-to-lead texter  " }), {
      ok: true,
      description: "build a speed-to-lead texter",
      reviewUrl: undefined,
    });
  });

  test("missing / non-string description is rejected", () => {
    assert.deepEqual(parseGenerateBody({}), { ok: false });
    assert.deepEqual(parseGenerateBody({ description: 123 }), { ok: false });
    assert.deepEqual(parseGenerateBody(null), { ok: false });
    assert.deepEqual(parseGenerateBody(undefined), { ok: false });
  });

  test("review_url is trimmed and optional; empty → undefined", () => {
    assert.equal(
      (parseGenerateBody({ description: "x", review_url: "  https://g.page/r/abc  " }) as { reviewUrl?: string }).reviewUrl,
      "https://g.page/r/abc",
    );
    assert.equal(
      (parseGenerateBody({ description: "x", review_url: "   " }) as { reviewUrl?: string }).reviewUrl,
      undefined,
    );
  });

  test("SECURITY: a caller-supplied orgId in the body is IGNORED (org comes from the guard)", () => {
    const r = parseGenerateBody({
      description: "x",
      orgId: "attacker-org",
      builderOrgId: "attacker-org",
      review_url: "https://g.page/r/abc",
    });
    // The parsed result carries no org field of any kind — only description + reviewUrl.
    assert.deepEqual(Object.keys(r).sort(), ["description", "ok", "reviewUrl"]);
  });
});
