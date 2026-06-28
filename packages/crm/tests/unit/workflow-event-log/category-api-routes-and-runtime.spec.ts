// SLICE 1-a Commit 6 — API routes + runtime helpers category per-
// site persistence tests. 4 files, 7 sites.

import { describe, test } from "node:test";

import { assertEmitOrgId, assertOrgIdExpr } from "./emit-site-extractor";

// 2026-06-28 — switched these two sites from line-anchored (assertOrgIdExpr)
// to event-name-anchored (assertEmitOrgId). FIX 3 of the security audit added
// host-resolution above the emits, shifting every line below it; the
// line-anchored matcher would silently drift to the wrong call. assertEmitOrgId
// locates each site by its event-name literal + enclosing function so it
// survives edits. A third site (lead.created → fires the speed-to-lead agent)
// is now asserted too: its orgId MUST be the verified-org `orgId`.
describe("SLICE 1-a — api/v1/forms/submit/route.ts (3 sites)", () => {
  test("contact.created — orgId", () => {
    assertEmitOrgId(
      "src/app/api/v1/forms/submit/route.ts",
      { event: "contact.created", inFunction: "POST" },
      "orgId",
    );
  });
  test("form.submitted — orgId", () => {
    assertEmitOrgId(
      "src/app/api/v1/forms/submit/route.ts",
      { event: "form.submitted", inFunction: "POST" },
      "orgId",
    );
  });
  test("lead.created — orgId (agent-fire must use the verified org)", () => {
    assertEmitOrgId(
      "src/app/api/v1/forms/submit/route.ts",
      { event: "lead.created", inFunction: "POST" },
      "orgId",
    );
  });
});

describe("SLICE 1-a — api/v1/landing/track-visit/route.ts (1 site)", () => {
  test("line 36 landing.visited — page.orgId", () => {
    assertOrgIdExpr("src/app/api/v1/landing/track-visit/route.ts", 36, "page.orgId");
  });
});

describe("SLICE 1-a — conversation/runtime.ts (2 sites)", () => {
  test("line 281 conversation.turn.received — input.orgId", () => {
    assertOrgIdExpr("src/lib/conversation/runtime.ts", 281, "input.orgId");
  });
  test("line 334 conversation.turn.sent — input.orgId", () => {
    assertOrgIdExpr("src/lib/conversation/runtime.ts", 334, "input.orgId");
  });
});

describe("SLICE 1-a — crm/custom-objects.ts (2 sites)", () => {
  test("line 1669 custom-object created — params.orgId", () => {
    assertOrgIdExpr("src/lib/crm/custom-objects.ts", 1669, "params.orgId");
  });
  test("line 1736 custom-object field_changed — params.orgId", () => {
    assertOrgIdExpr("src/lib/crm/custom-objects.ts", 1736, "params.orgId");
  });
});
