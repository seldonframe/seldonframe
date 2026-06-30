// Marketplace buyer onboarding — TDD for the "My Agent" home VIEW assembler.
//
// buildMyAgentHomeView(input) maps a loaded BuyerAgentView + recent conversation
// & booking rows → the serializable home view: status chip, channel chips, this-
// week stats, the merged activity feed (with outcome badges), booking cards,
// Configure deep-links, and the billing panel. All pure (a pinned `now`).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildMyAgentHomeView,
  getBuyerAgentHome,
  type BuildMyAgentHomeInput,
  type HomeConversationRow,
  type HomeBookingRow,
  type GetBuyerAgentHomeDeps,
} from "../../../../src/lib/marketplace/buyer/agent-home";
import type { BuyerAgentView } from "../../../../src/lib/marketplace/buyer/buyer-deployment";
import type { OnboardingStep } from "../../../../src/lib/marketplace/onboarding/steps";

const NOW = new Date("2026-06-30T12:00:00Z");
const HOURS_AGO = (h: number) => new Date(NOW.getTime() - h * 3600_000);
const DAYS_AGO = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const RECEPTIONIST_STEPS: OnboardingStep[] = [
  { kind: "business_info", label: "About your business", required: true },
  { kind: "connect_tool", label: "Connect googlecalendar", required: false, toolkit: "googlecalendar" },
  { kind: "phone", label: "Your phone", required: true },
  { kind: "test", label: "Hear it work", required: false },
  { kind: "go_live", label: "Go live", required: true },
];

function makeView(
  deployment: Record<string, unknown> = {},
  steps = RECEPTIONIST_STEPS,
): BuyerAgentView {
  return {
    deployment: {
      id: "dep-1",
      builderOrgId: "buyer-1",
      agentTemplateId: "tmpl-1",
      clientName: "Northgate Plumbing",
      surface: "phone",
      status: "active",
      priceCents: 4900,
      ...deployment,
    } as BuyerAgentView["deployment"],
    blueprint: {},
    steps,
    progress: { doneKinds: [] },
    nextStep: steps[0],
  };
}

function input(over: Partial<BuildMyAgentHomeInput> = {}): BuildMyAgentHomeInput {
  return {
    view: makeView(),
    conversations: [],
    bookings: [],
    hasPaidPurchase: false,
    now: NOW,
    ...over,
  };
}

test("status: active → live; paused → paused; draft → setting_up", () => {
  assert.equal(buildMyAgentHomeView(input({ view: makeView({ status: "active" }) })).status, "live");
  assert.equal(buildMyAgentHomeView(input({ view: makeView({ status: "paused" }) })).status, "paused");
  assert.equal(buildMyAgentHomeView(input({ view: makeView({ status: "draft" }) })).status, "setting_up");
});

test("channels: a phone deployment gets Phone + SMS; an embed gets Web chat", () => {
  assert.deepEqual(buildMyAgentHomeView(input()).channels, ["Phone", "SMS"]);
  assert.deepEqual(
    buildMyAgentHomeView(input({ view: makeView({ surface: "embed" }) })).channels,
    ["Web chat"],
  );
});

test("businessName: prefers customization.businessInfo.name, falls back to clientName", () => {
  const named = buildMyAgentHomeView(
    input({ view: makeView({ customization: { businessInfo: { name: "Acme" } } }) }),
  );
  assert.equal(named.businessName, "Acme");
  assert.equal(buildMyAgentHomeView(input()).businessName, "Northgate Plumbing");
});

test("week stats: count this-week calls (excluding test) + this-week bookings (excluding templates)", () => {
  const conversations: HomeConversationRow[] = [
    { id: "c1", status: "completed", startedAt: HOURS_AGO(2), lastTurnAt: HOURS_AGO(2) },
    { id: "c2", status: "active", startedAt: DAYS_AGO(2), lastTurnAt: DAYS_AGO(2) },
    { id: "c3", status: "test", startedAt: HOURS_AGO(1), lastTurnAt: HOURS_AGO(1) }, // excluded
    { id: "c4", status: "completed", startedAt: DAYS_AGO(10), lastTurnAt: DAYS_AGO(10) }, // too old
  ];
  const bookings: HomeBookingRow[] = [
    { id: "b1", title: "Drain cleaning", status: "completed", startsAt: HOURS_AGO(3) },
    { id: "b2", title: "Template", status: "template", startsAt: HOURS_AGO(1) }, // excluded
    { id: "b3", title: "Heater", status: "scheduled", startsAt: DAYS_AGO(9) }, // too old
  ];
  const v = buildMyAgentHomeView(input({ conversations, bookings }));
  const byLabel = Object.fromEntries(v.weekStats.map((s) => [s.label, s.value]));
  assert.equal(byLabel["Calls answered"], "2"); // c1 + c2
  assert.equal(byLabel["Jobs booked"], "1"); // b1
});

test("activity feed: merges calls + bookings newest-first with outcome badges; tops out at 6", () => {
  const conversations: HomeConversationRow[] = Array.from({ length: 5 }, (_, i) => ({
    id: `c${i}`,
    status: i === 0 ? "escalated" : "completed",
    startedAt: HOURS_AGO(i + 1),
    lastTurnAt: HOURS_AGO(i + 1),
    preview: `Caller ${i}`,
  }));
  const bookings: HomeBookingRow[] = [
    { id: "bk", title: "Water heater", status: "completed", startsAt: HOURS_AGO(0.5), fullName: "Jane" },
  ];
  const v = buildMyAgentHomeView(input({ conversations, bookings }));
  assert.equal(v.activity.length, 6); // 5 + 1 capped at 6
  // The newest (0.5h) is the booking.
  assert.equal(v.activity[0].icon, "calendar");
  assert.equal(v.activity[0].badgeLabel, "Completed");
  assert.equal(v.activity[0].title, "Water heater");
  // An escalated call reads as the amber "Escalated" badge.
  const escalated = v.activity.find((a) => a.badgeLabel === "Escalated");
  assert.ok(escalated);
  assert.equal(escalated?.badgeTone, "amber");
});

test("booking cards: top 2 non-cancelled, with a human when label + customer", () => {
  const bookings: HomeBookingRow[] = [
    { id: "b1", title: "Drain cleaning", status: "scheduled", startsAt: DAYS_AGO(1), fullName: "Sam" },
    { id: "b2", title: "Inspection", status: "cancelled", startsAt: HOURS_AGO(2), fullName: "Lee" },
    { id: "b3", title: "Heater", status: "completed", startsAt: HOURS_AGO(4), fullName: "Pat" },
  ];
  const v = buildMyAgentHomeView(input({ bookings }));
  assert.equal(v.bookings.length, 2); // cancelled dropped
  assert.ok(v.bookings.every((c) => c.service && c.customer && c.when));
  assert.ok(!v.bookings.some((c) => c.service === "Inspection"));
});

test("configure cards: derived from the agent's real steps (business_info, calendar, phone for a receptionist) with deep-links", () => {
  const v = buildMyAgentHomeView(input());
  const byKind = Object.fromEntries(v.configure.map((c) => [c.kind, c]));
  assert.ok(byKind.business_info);
  assert.ok(byKind.phone);
  assert.ok(byKind.connect_tool);
  // Deep-links back into the wizard step.
  assert.ok(byKind.business_info.href.includes("/agent/dep-1/setup"));
  assert.ok(byKind.business_info.href.includes("step=business_info"));
});

test("configure cards: a chat agent (no phone step) gets no phone card", () => {
  const chatSteps: OnboardingStep[] = [
    { kind: "business_info", label: "About your business", required: true },
    { kind: "test", label: "Hear it work", required: false },
    { kind: "go_live", label: "Go live", required: true },
  ];
  const v = buildMyAgentHomeView(input({ view: makeView({ surface: "embed" }, chatSteps) }));
  assert.ok(!v.configure.some((c) => c.kind === "phone"));
  assert.ok(v.configure.some((c) => c.kind === "business_info"));
});

test("billing: a paid agent with an active purchase can manage; a free agent cannot", () => {
  const paid = buildMyAgentHomeView(input({ hasPaidPurchase: true }));
  assert.equal(paid.billing.price, "$49/mo");
  assert.equal(paid.billing.canManage, true);

  const free = buildMyAgentHomeView(
    input({ view: makeView({ priceCents: 0 }), hasPaidPurchase: false }),
  );
  assert.equal(free.billing.price, "Free");
  assert.equal(free.billing.canManage, false);
});

test("tolerates an empty agent (no activity) without throwing", () => {
  const v = buildMyAgentHomeView(input());
  assert.deepEqual(v.activity, []);
  assert.deepEqual(v.bookings, []);
  assert.equal(v.weekStats.find((s) => s.label === "Calls answered")?.value, "0");
});

// ─── getBuyerAgentHome (DI'd org-scope) ──────────────────────────────────────

test("getBuyerAgentHome: returns null when the deployment isn't the buyer's", async () => {
  const deps: GetBuyerAgentHomeDeps = {
    loadAgent: async () => null, // not owned → null
    listConversations: async () => [],
    listBookings: async () => [],
    hasPaidPurchase: async () => false,
    now: () => NOW,
  };
  assert.equal(await getBuyerAgentHome("dep-x", "someone-else", deps), null);
});

test("getBuyerAgentHome: reads activity from clientOrgId when set, else the buyer org", async () => {
  const seenOrgIds: string[] = [];
  const mk = (clientOrgId: string | null) => {
    const deps: GetBuyerAgentHomeDeps = {
      loadAgent: async () => makeView({ clientOrgId }),
      listConversations: async (orgId) => {
        seenOrgIds.push(orgId);
        return [];
      },
      listBookings: async () => [],
      hasPaidPurchase: async () => false,
      now: () => NOW,
    };
    return deps;
  };
  await getBuyerAgentHome("dep-1", "buyer-1", mk("client-org-9"));
  assert.equal(seenOrgIds.at(-1), "client-org-9"); // clientOrgId wins
  await getBuyerAgentHome("dep-1", "buyer-1", mk(null));
  assert.equal(seenOrgIds.at(-1), "buyer-1"); // falls back to the buyer org
});
