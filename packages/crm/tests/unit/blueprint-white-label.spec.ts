import { test } from "node:test";
import assert from "node:assert/strict";

import { renderGeneralServiceV1 } from "@/lib/blueprint/renderers/general-service-v1";
import { renderCalcomMonthV1 } from "@/lib/blueprint/renderers/calcom-month-v1";
import { renderFormbricksStackV1 } from "@/lib/blueprint/renderers/formbricks-stack-v1";
import { pickTemplate } from "@/lib/blueprint/templates";

// P0-3 white-label: paying tiers should not see "Powered by SeldonFrame"
// in the rendered HTML footer of any of the three blueprint surfaces.
// These tests pin the flag-vs-output contract — a regression here means
// paying customers go back to seeing the brand they paid to remove.

const POWERED_BY_NEEDLE = "Powered by";

// ─── general-service-v1 (landing) ─────────────────────────────────────

test("renderGeneralServiceV1 — default keeps Powered by (free / starter tiers)", () => {
  const out = renderGeneralServiceV1(pickTemplate("hvac"));
  assert.ok(out.html.includes(POWERED_BY_NEEDLE), "free tier should see the badge");
});

test("renderGeneralServiceV1 — { removePoweredBy: true } strips the badge (paid tiers)", () => {
  const out = renderGeneralServiceV1(pickTemplate("hvac"), { removePoweredBy: true });
  assert.ok(
    !out.html.includes(POWERED_BY_NEEDLE),
    "paid tier (Cloud Pro / Cloud Agency) must NOT see the badge"
  );
  // The footer chrome itself should still render — only the powered-by
  // line goes away.
  assert.ok(out.html.includes("sf-footer"), "footer still renders");
  assert.ok(out.html.includes("sf-footer__bottom"), "footer bottom row still renders");
});

test("renderGeneralServiceV1 — { removePoweredBy: false } is identical to default", () => {
  const a = renderGeneralServiceV1(pickTemplate("hvac"));
  const b = renderGeneralServiceV1(pickTemplate("hvac"), { removePoweredBy: false });
  assert.equal(a.html, b.html, "explicit-false matches default behavior");
});

// ─── calcom-month-v1 (booking) ─────────────────────────────────────────

test("renderCalcomMonthV1 — default keeps Powered by", () => {
  const out = renderCalcomMonthV1(pickTemplate("hvac"));
  assert.ok(out.html.includes(POWERED_BY_NEEDLE));
});

test("renderCalcomMonthV1 — { removePoweredBy: true } strips the badge", () => {
  const out = renderCalcomMonthV1(pickTemplate("hvac"), { removePoweredBy: true });
  assert.ok(!out.html.includes(POWERED_BY_NEEDLE));
  assert.ok(out.html.includes("sf-footer--booking"), "booking footer still renders");
});

// ─── formbricks-stack-v1 (intake) ──────────────────────────────────────

test("renderFormbricksStackV1 — default keeps Powered by", () => {
  const out = renderFormbricksStackV1(pickTemplate("hvac"));
  assert.ok(out.html.includes(POWERED_BY_NEEDLE));
});

test("renderFormbricksStackV1 — { removePoweredBy: true } strips the badge", () => {
  const out = renderFormbricksStackV1(pickTemplate("hvac"), { removePoweredBy: true });
  assert.ok(!out.html.includes(POWERED_BY_NEEDLE));
  assert.ok(out.html.includes("sf-footer--intake"), "intake footer still renders");
});

// ─── Determinism with the flag ────────────────────────────────────────

test("renderGeneralServiceV1 — output is byte-stable with removePoweredBy on", () => {
  const a = renderGeneralServiceV1(pickTemplate("hvac"), { removePoweredBy: true });
  const b = renderGeneralServiceV1(pickTemplate("hvac"), { removePoweredBy: true });
  assert.equal(a.html, b.html);
  assert.equal(a.css, b.css);
});

test("All three renderers — flag has zero effect on CSS output (HTML-only difference)", () => {
  const bp = pickTemplate("hvac");
  // CSS is shared across all renders; only HTML changes per the flag.
  // This guards against a refactor that accidentally branches CSS too.
  const landingFree = renderGeneralServiceV1(bp).css;
  const landingPaid = renderGeneralServiceV1(bp, { removePoweredBy: true }).css;
  const bookingFree = renderCalcomMonthV1(bp).css;
  const bookingPaid = renderCalcomMonthV1(bp, { removePoweredBy: true }).css;
  const intakeFree = renderFormbricksStackV1(bp).css;
  const intakePaid = renderFormbricksStackV1(bp, { removePoweredBy: true }).css;
  assert.equal(landingFree, landingPaid, "landing CSS unchanged by flag");
  assert.equal(bookingFree, bookingPaid, "booking CSS unchanged by flag");
  assert.equal(intakeFree, intakePaid, "intake CSS unchanged by flag");
});
