// v1.55.x — Tests for the demo-portal seed helper.
//
// The helper itself does I/O (contact + booking + message inserts),
// so we cover the I/O-free pieces only: the pure shape builder
// (buildDemoSeedShape) plus the timezone-aware tomorrow-morning range
// computation (buildTomorrowMorningRange). The I/O wrapper is tested
// implicitly via integration when v2/complete fires in dev/CI.
//
// The contract these pure helpers guarantee is what tests assert:
//   1. Demo contact carries the '__demo__' tag (filterable in
//      operator CRM lists).
//   2. Demo contact has portalAccessEnabled=true (else the /demo
//      route can't sign a session for it — the route query filters
//      by portalAccessEnabled).
//   3. Email is `demo+<orgSlug>@example.com` (collides with no real
//      customer email; the partial unique index on (org_id, lower(
//      email)) allows multiple demo workspaces to coexist).
//   4. Welcome message mentions "Demo Customer" + "sample" — copy is
//      load-bearing because the prospect reads it; if marketing later
//      changes the welcome wording, the test catches it.
//   5. tomorrow-morning range starts at 10:00 local time + ends 1h
//      later. (60-minute slot is the demo's "obvious enough" length.)

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDemoSeedShape,
  buildTomorrowMorningRange,
  DEMO_CONTACT_TAG,
} from "../../src/lib/workspace/seed-demo-portal";

describe("buildDemoSeedShape — pure shape construction", () => {
  test("demo contact patch includes __demo__ tag, portalAccessEnabled true, and demo+<slug>@example.com email", () => {
    const shape = buildDemoSeedShape({
      orgId: "org-123",
      businessName: "Ignitify Cooling and Heating",
      timezone: "America/Phoenix",
      orgSlug: "ignitify-cooling-and-heating",
    });

    // Tag — filterable in operator-facing CRM lists.
    assert.deepEqual(shape.contact.tags, [DEMO_CONTACT_TAG]);
    assert.equal(DEMO_CONTACT_TAG, "__demo__", "tag literal must stay '__demo__'");

    // portalAccessEnabled — required for the /demo route's lookup.
    assert.equal(shape.contact.portalAccessEnabled, true);

    // Email — pinned format. Collides with no real customer email and
    // satisfies the partial unique index on (org_id, lower(email)).
    assert.equal(shape.contact.email, "demo+ignitify-cooling-and-heating@example.com");

    // OrgId propagates through.
    assert.equal(shape.contact.orgId, "org-123");

    // Other contact fields — pinned because they affect the prospect's
    // first impression of the portal (status="active", source="demo").
    assert.equal(shape.contact.firstName, "Demo");
    assert.equal(shape.contact.lastName, "Customer");
    assert.equal(shape.contact.status, "active");
    assert.equal(shape.contact.source, "demo");
  });

  test("welcome message body mentions 'Demo Customer' and 'sample'", () => {
    const shape = buildDemoSeedShape({
      orgId: "org-1",
      businessName: "Acme Plumbing",
      timezone: "UTC",
      orgSlug: "acme-plumbing",
    });

    // Body — load-bearing copy. The prospect reads this in their first
    // 10 seconds in the portal; it sets the "you're seeing the demo,
    // here's what real customers will see" frame.
    assert.match(shape.message.body, /Demo Customer/);
    assert.match(shape.message.body, /sample/i);

    // senderType "operator" — message is FROM the business TO the demo
    // contact (not the other way around). Matters for the portal UI
    // which renders client-vs-operator bubbles differently.
    assert.equal(shape.message.senderType, "operator");
    assert.equal(shape.message.senderName, "Acme Plumbing");
    assert.equal(shape.message.subject, "Welcome to Acme Plumbing");
  });

  test("booking shape has confirmed status + sample notes", () => {
    const shape = buildDemoSeedShape({
      orgId: "org-1",
      businessName: "Acme",
      timezone: "UTC",
      orgSlug: "acme",
    });
    // The booking shows up on the portal's "upcoming" tab — status
    // "confirmed" because "pending" would render with a CTA the
    // prospect can't action.
    assert.equal(shape.booking.status, "confirmed");
    assert.match(shape.booking.notes, /demo/i);
  });
});

describe("buildTomorrowMorningRange — timezone-aware computation", () => {
  test("returns tomorrow at 10:00 in the given timezone (UTC reference)", () => {
    // Fixed reference time: 2026-05-16 12:00:00 UTC.
    const now = new Date("2026-05-16T12:00:00.000Z");
    const { startsAt } = buildTomorrowMorningRange(now, "UTC");
    // Tomorrow in UTC is 2026-05-17, 10:00:00 UTC.
    assert.equal(startsAt.toISOString(), "2026-05-17T10:00:00.000Z");
  });

  test("end time is exactly one hour after start time", () => {
    const now = new Date("2026-05-16T12:00:00.000Z");
    const { startsAt, endsAt } = buildTomorrowMorningRange(now, "America/Phoenix");
    const deltaMs = endsAt.getTime() - startsAt.getTime();
    assert.equal(deltaMs, 60 * 60 * 1000, "endsAt should be exactly 60 min after startsAt");
  });

  test("offsets the start time so local 10:00 in America/Phoenix is later in UTC", () => {
    // Phoenix is UTC-7 year-round (no DST). Tomorrow's 10:00 Phoenix =
    // 17:00 UTC. (Compared to UTC: 10:00 UTC.)
    const now = new Date("2026-05-16T12:00:00.000Z");
    const utcResult = buildTomorrowMorningRange(now, "UTC");
    const phoenixResult = buildTomorrowMorningRange(now, "America/Phoenix");
    const offsetMs = phoenixResult.startsAt.getTime() - utcResult.startsAt.getTime();
    // Phoenix is 7 hours behind UTC -> local 10:00 Phoenix happens 7
    // hours AFTER 10:00 UTC.
    assert.equal(offsetMs, 7 * 60 * 60 * 1000, "Phoenix is UTC-7 → local 10:00 is 7h later in UTC");
  });

  test("falls back gracefully for unknown timezones (no throw)", () => {
    // If Intl can't resolve the timezone, the helper falls back to
    // UTC offset 0. Critical: must NOT throw — the seed is best-effort.
    const now = new Date("2026-05-16T12:00:00.000Z");
    let result: { startsAt: Date; endsAt: Date } | undefined;
    assert.doesNotThrow(() => {
      result = buildTomorrowMorningRange(now, "Not/A_RealZone");
    });
    assert.ok(result, "result should be set even on unknown timezone");
    assert.equal(result!.startsAt.toISOString(), "2026-05-17T10:00:00.000Z");
  });
});
