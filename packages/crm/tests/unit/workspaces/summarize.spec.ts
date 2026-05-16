// packages/crm/tests/unit/workspaces/summarize.spec.ts
//
// Tests the pure shape function that turns assembled raw rows into the
// WorkspaceSummary returned by GET /api/v1/web/workspaces/mine.
//
// The function takes a `now` parameter so we can deterministically assert
// the "paused" 30-day cutoff without freezing the system clock.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { summarizeWorkspace } from "../../../src/lib/workspaces/summarize";

const NOW = new Date("2026-05-16T12:00:00.000Z");

describe("summarizeWorkspace — base shape", () => {
  test("returns publicUrl + dashboardUrl built from slug + base domain", () => {
    const summary = summarizeWorkspace({
      id: "org-1",
      slug: "acme",
      name: "Acme Co",
      soulCompletedAt: NOW,
      contactCount: 3,
      lastActivityAt: NOW,
      newLeadsThisWeek: 2,
      workspaceBaseDomain: "seldonframe.app",
      now: NOW,
    });

    assert.equal(summary.id, "org-1");
    assert.equal(summary.slug, "acme");
    assert.equal(summary.name, "Acme Co");
    assert.equal(summary.publicUrl, "https://acme.seldonframe.app");
    assert.equal(summary.dashboardUrl, "/dashboard?workspace=org-1");
    assert.equal(summary.contactCount, 3);
    assert.equal(summary.newLeadsThisWeek, 2);
  });
});

describe("summarizeWorkspace — status", () => {
  test('status is "active" when soulCompleted AND lastActivity within 30 days', () => {
    const summary = summarizeWorkspace({
      id: "org-1",
      slug: "acme",
      name: "Acme",
      soulCompletedAt: new Date("2026-05-01T00:00:00.000Z"),
      contactCount: 1,
      lastActivityAt: new Date("2026-05-10T00:00:00.000Z"),
      newLeadsThisWeek: 0,
      workspaceBaseDomain: "seldonframe.app",
      now: NOW,
    });
    assert.equal(summary.status, "active");
  });

  test('status is "setup" when soulCompleted is null', () => {
    const summary = summarizeWorkspace({
      id: "org-1",
      slug: "acme",
      name: "Acme",
      soulCompletedAt: null,
      contactCount: 0,
      lastActivityAt: null,
      newLeadsThisWeek: 0,
      workspaceBaseDomain: "seldonframe.app",
      now: NOW,
    });
    assert.equal(summary.status, "setup");
  });

  test('status is "paused" when soulCompleted but lastActivity older than 30 days', () => {
    const oldActivity = new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000);
    const summary = summarizeWorkspace({
      id: "org-1",
      slug: "acme",
      name: "Acme",
      soulCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
      contactCount: 5,
      lastActivityAt: oldActivity,
      newLeadsThisWeek: 0,
      workspaceBaseDomain: "seldonframe.app",
      now: NOW,
    });
    assert.equal(summary.status, "paused");
  });
});

describe("summarizeWorkspace — lastActivityAt formatting", () => {
  test("returns ISO string when activity exists", () => {
    const summary = summarizeWorkspace({
      id: "org-1",
      slug: "acme",
      name: "Acme",
      soulCompletedAt: NOW,
      contactCount: 0,
      lastActivityAt: NOW,
      newLeadsThisWeek: 0,
      workspaceBaseDomain: "seldonframe.app",
      now: NOW,
    });
    assert.equal(summary.lastActivityAt, NOW.toISOString());
  });

  test("returns null when no activity", () => {
    const summary = summarizeWorkspace({
      id: "org-1",
      slug: "acme",
      name: "Acme",
      soulCompletedAt: NOW,
      contactCount: 0,
      lastActivityAt: null,
      newLeadsThisWeek: 0,
      workspaceBaseDomain: "seldonframe.app",
      now: NOW,
    });
    assert.equal(summary.lastActivityAt, null);
  });
});
