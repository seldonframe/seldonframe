// packages/crm/tests/unit/describe-it-step-copy.spec.ts
//
// describeItStep1 is extracted to a plain module
// (src/components/landing/describe-it-step-copy.ts) rather than imported
// from marketing-build-steps.tsx directly — that component is
// framer-motion/JSX-heavy and not meant to be dragged into node:test/tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { describeItStep1 } from "../../src/components/landing/describe-it-step-copy";

test("flag off → byte-identical original copy (both tabs already go to signup, no asymmetry to disclose)", () => {
  assert.equal(describeItStep1(false), "Paste your client's URL or describe their business");
});

test("flag on → discloses that describing requires signup while pasting a URL builds instantly", () => {
  const copy = describeItStep1(true);
  assert.equal(copy, "Paste your client's URL — instant build. Describing it takes one quick signup first.");
  assert.match(copy, /instant build/i);
  assert.match(copy, /signup/i);
});
