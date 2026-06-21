// ICP-3 — tests for the deployment number resolver (resolve-deployment-by-number.ts).
//
// Mirrors resolve-workspace-by-number.spec.ts: matchDeploymentByPhoneNumber is
// PURE (no DB) so the E.164 normalization + status='active' filter are exercised
// directly; resolveDeploymentByNumber is DB-backed but takes injectable deps so
// the match/no-match/normalization paths run without a real Postgres.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  matchDeploymentByPhoneNumber,
  resolveDeploymentByNumber,
  type DeploymentNumberRow,
} from "../../../../src/lib/agents/voice/resolve-deployment-by-number";

const ACTIVE_A: DeploymentNumberRow = {
  id: "dep-a",
  builderOrgId: "builder-1",
  agentTemplateId: "tmpl-1",
  phoneNumber: "+18335550100",
  status: "active",
};
const ACTIVE_B_LOOSE: DeploymentNumberRow = {
  id: "dep-b",
  builderOrgId: "builder-2",
  agentTemplateId: "tmpl-2",
  // Stored loosely — must normalize to +15125550111 before comparing.
  phoneNumber: "(512) 555-0111",
  status: "active",
};
const DRAFT: DeploymentNumberRow = {
  id: "dep-draft",
  builderOrgId: "builder-3",
  agentTemplateId: "tmpl-3",
  phoneNumber: "+15125550111", // same number as ACTIVE_B but not active
  status: "draft",
};
const PAUSED: DeploymentNumberRow = {
  id: "dep-paused",
  builderOrgId: "builder-4",
  agentTemplateId: "tmpl-4",
  phoneNumber: "+19998887777",
  status: "paused",
};

describe("matchDeploymentByPhoneNumber — pure matcher", () => {
  test("matches an active deployment on exact E.164", () => {
    const m = matchDeploymentByPhoneNumber("+18335550100", [ACTIVE_A]);
    assert.equal(m?.id, "dep-a");
  });

  test("normalizes the stored number before comparing", () => {
    const m = matchDeploymentByPhoneNumber("+15125550111", [ACTIVE_B_LOOSE]);
    assert.equal(m?.id, "dep-b");
  });

  test("ignores non-active rows even when the number matches", () => {
    // Only DRAFT carries this number; it must NOT match.
    const m = matchDeploymentByPhoneNumber("+15125550111", [DRAFT]);
    assert.equal(m, null);
  });

  test("prefers the active row over a same-number non-active row", () => {
    const m = matchDeploymentByPhoneNumber("+15125550111", [DRAFT, ACTIVE_B_LOOSE]);
    assert.equal(m?.id, "dep-b");
  });

  test("ignores paused deployments", () => {
    const m = matchDeploymentByPhoneNumber("+19998887777", [PAUSED]);
    assert.equal(m, null);
  });

  test("returns null when nothing matches", () => {
    const m = matchDeploymentByPhoneNumber("+11112223333", [ACTIVE_A, ACTIVE_B_LOOSE]);
    assert.equal(m, null);
  });

  test("skips rows with a null phone number", () => {
    const noPhone: DeploymentNumberRow = {
      id: "dep-x",
      builderOrgId: "b",
      agentTemplateId: "t",
      phoneNumber: null,
      status: "active",
    };
    assert.equal(matchDeploymentByPhoneNumber("+18335550100", [noPhone]), null);
  });
});

describe("resolveDeploymentByNumber — DB-backed resolver (DI)", () => {
  test("returns the active deployment matching the dialed number", async () => {
    const result = await resolveDeploymentByNumber("+18335550100", {
      loadActiveDeployments: async () => [ACTIVE_A, ACTIVE_B_LOOSE],
    });
    assert.equal(result?.id, "dep-a");
    assert.equal(result?.builderOrgId, "builder-1");
    assert.equal(result?.agentTemplateId, "tmpl-1");
  });

  test("normalizes the DIALED number before matching", async () => {
    // Loose dialed input still resolves to the stored E.164 deployment.
    const result = await resolveDeploymentByNumber("512-555-0111", {
      loadActiveDeployments: async () => [ACTIVE_B_LOOSE],
    });
    assert.equal(result?.id, "dep-b");
  });

  test("returns null when no active deployment matches", async () => {
    const result = await resolveDeploymentByNumber("+18335550100", {
      loadActiveDeployments: async () => [ACTIVE_B_LOOSE],
    });
    assert.equal(result, null);
  });

  test("returns null for a null dialed number without touching the DB", async () => {
    let called = false;
    const result = await resolveDeploymentByNumber(null, {
      loadActiveDeployments: async () => {
        called = true;
        return [ACTIVE_A];
      },
    });
    assert.equal(result, null);
    assert.equal(called, false, "must not query the DB when there is no dialed number");
  });

  test("returns null for an empty/blank dialed number without touching the DB", async () => {
    let called = false;
    const result = await resolveDeploymentByNumber("   ", {
      loadActiveDeployments: async () => {
        called = true;
        return [ACTIVE_A];
      },
    });
    assert.equal(result, null);
    assert.equal(called, false);
  });
});
