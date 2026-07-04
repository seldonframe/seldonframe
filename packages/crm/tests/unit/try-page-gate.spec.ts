// packages/crm/tests/unit/try-page-gate.spec.ts
//
// The /try page (src/app/(public)/try/page.tsx) calls notFound() when
// isWebUngatedBuildOn(process.env) is false — this documents that 404
// contract by pinning the same flag semantics the page relies on. Direct
// server-component rendering isn't practical to unit test here (no
// next/navigation harness in this suite), so this asserts the shared
// helper's behavior instead.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";

test("/try gate follows the strict flag (page calls notFound() when off)", () => {
  assert.equal(isWebUngatedBuildOn({}), false);
  assert.equal(isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: "1" }), true);
});
