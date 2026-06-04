/**
 * onboarding-flow.spec.ts — End-to-end integration test
 *
 * Exercises the full submission → buildChangePlan → applyChangePlan pipeline
 * without any DB or network. Uses capturing mock deps so we can assert that:
 *
 *  1. All 6 surfaces ran in order.
 *  2. The data flowed correctly: writeSoul got the right soul keys; applyBooking
 *     received a plan with Monday enabled + Sunday disabled; importContacts
 *     received a plan with the contacts_file URL; applyTheme got the plan with
 *     brand colors; every surface reports ok: true.
 *  3. Surfaces are resilient: a single failure leaves the other five ok.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildChangePlan } from "../../../src/lib/onboarding/change-plan";
import { applyChangePlan } from "../../../src/lib/onboarding/execute-change-plan";
import type { ChangePlan } from "../../../src/lib/onboarding/change-plan";
import type { ApplyChangePlanDeps } from "../../../src/lib/onboarding/execute-change-plan";

// ── representative submission data ───────────────────────────────────────────

const submissionData: Record<string, unknown> = {
  business_name: "Calm Hands Massage",
  tagline: "Therapeutic massage in Austin, TX",
  phone: "(512) 555-0100",
  email: "hello@calmhands.com",
  has_public_address: "Yes",
  address: "400 Lavaca St, Austin TX 78701",
  // hours_text deliberately sets Mon–Sat enabled, Sun closed
  hours_text: "Mon-Fri 9am-5pm, Sat 10am-2pm, closed Sun",
  // services_text has two appointment types
  services_text: "60-min massage — $90\nDeep tissue (90 min) - $130",
  primary_service: "60-min massage",
  call_handling: "AI answers every call",
  lead_routing: ["email", "text"],
  has_domain: "Yes",
  domain: "calmhands.com",
  // contacts_file: a blob URL the dep should receive as-is
  contacts_file: "https://blob.vercel-storage.com/contacts-abc123.csv",
  // brand colors so the theme surface is exercised
  brand_colors: "Primary: #1a7a6e  Accent: #f4a261",
  google_reviews_url: "https://maps.google.com/?cid=12345",
};

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build capturing mock deps. Each dep pushes a record for inspection. */
function buildMockDeps(): {
  deps: ApplyChangePlanDeps;
  calls: { name: string; orgId: string; args: unknown[] }[];
} {
  const calls: { name: string; orgId: string; args: unknown[] }[] = [];

  const deps: ApplyChangePlanDeps = {
    async writeSoul(orgId, soul) {
      calls.push({ name: "writeSoul", orgId, args: [soul] });
    },
    async seedLanding(orgId) {
      calls.push({ name: "seedLanding", orgId, args: [] });
    },
    async applyBooking(orgId, plan) {
      calls.push({ name: "applyBooking", orgId, args: [plan] });
    },
    async applyTheme(orgId, plan) {
      calls.push({ name: "applyTheme", orgId, args: [plan] });
    },
    async refreshChatbot(orgId) {
      calls.push({ name: "refreshChatbot", orgId, args: [] });
    },
    async importContacts(orgId, plan) {
      calls.push({ name: "importContacts", orgId, args: [plan] });
    },
  };

  return { deps, calls };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("onboarding-flow integration", () => {
  it("buildChangePlan produces a fully-populated plan from submission data", () => {
    const plan = buildChangePlan(submissionData);

    // Soul fields
    assert.equal(plan.soul.business_name, "Calm Hands Massage");
    assert.equal(plan.soul.tagline, "Therapeutic massage in Austin, TX");
    assert.equal(plan.soul.phone, "(512) 555-0100");
    assert.equal(plan.soul.email, "hello@calmhands.com");

    // Booking: weekday enabled, Sunday disabled
    assert.ok(plan.bookingDefault, "bookingDefault should be defined");
    assert.equal(plan.bookingDefault!.availability.monday.enabled, true, "Monday enabled");
    assert.equal(plan.bookingDefault!.availability.friday.enabled, true, "Friday enabled");
    assert.equal(plan.bookingDefault!.availability.saturday.enabled, true, "Saturday enabled");
    assert.equal(plan.bookingDefault!.availability.sunday.enabled, false, "Sunday disabled");
    assert.equal(plan.bookingDefault!.primaryServiceName, "60-min massage");

    // Appointment types from services_text
    assert.equal(plan.appointmentTypes.length, 2, "two appointment types parsed");
    assert.equal(plan.appointmentTypes[0]!.durationMinutes, 60);
    assert.equal(plan.appointmentTypes[0]!.price, 90);
    assert.equal(plan.appointmentTypes[1]!.durationMinutes, 90);
    assert.equal(plan.appointmentTypes[1]!.price, 130);

    // Contacts file URL
    assert.equal(plan.contactsFileUrl, "https://blob.vercel-storage.com/contacts-abc123.csv");

    // Call handling
    assert.equal(plan.callHandling, "ai_voice");

    // Lead routing
    assert.deepEqual(plan.leadRouting, ["email", "text"]);

    // Domain
    assert.equal(plan.domain, "calmhands.com");

    // Theme (hex colors extracted)
    assert.ok(plan.theme, "theme should be defined when brand_colors present");
    assert.equal(plan.theme!.primaryColor, "#1a7a6e");
    assert.equal(plan.theme!.accentColor, "#f4a261");

    // Summaries are non-empty
    assert.ok(plan.summaries.length > 0, "summaries populated");
  });

  it("applyChangePlan runs all 6 surfaces in order and every surface reports ok", async () => {
    const plan = buildChangePlan(submissionData);
    const { deps, calls } = buildMockDeps();

    const result = await applyChangePlan("org-test", plan, deps);

    // ── order assertion ──────────────────────────────────────────────────────
    const order = calls.map(c => c.name);
    assert.deepEqual(
      order,
      ["writeSoul", "seedLanding", "applyBooking", "applyTheme", "refreshChatbot", "importContacts"],
      "surfaces run in declared order"
    );

    // ── all surfaces targeted the right org ─────────────────────────────────
    for (const call of calls) {
      assert.equal(call.orgId, "org-test", `${call.name} received correct orgId`);
    }

    // ── result: every surface ok ─────────────────────────────────────────────
    assert.equal(result.soul.ok, true, "soul ok");
    assert.equal(result.landing.ok, true, "landing ok");
    assert.equal(result.booking.ok, true, "booking ok");
    assert.equal(result.theme.ok, true, "theme ok");
    assert.equal(result.chatbot.ok, true, "chatbot ok");
    assert.equal(result.contacts.ok, true, "contacts ok");
  });

  it("writeSoul received the correct soul data (business_name, email, phone)", () => {
    const plan = buildChangePlan(submissionData);
    const { deps, calls } = buildMockDeps();

    return applyChangePlan("org-test", plan, deps).then(() => {
      const soulCall = calls.find(c => c.name === "writeSoul");
      assert.ok(soulCall, "writeSoul was called");
      const soul = soulCall!.args[0] as Record<string, unknown>;
      assert.equal(soul.business_name, "Calm Hands Massage");
      assert.equal(soul.email, "hello@calmhands.com");
      assert.equal(soul.phone, "(512) 555-0100");
    });
  });

  it("applyBooking received a plan with Monday enabled and Sunday disabled", () => {
    const plan = buildChangePlan(submissionData);
    const { deps, calls } = buildMockDeps();

    return applyChangePlan("org-test", plan, deps).then(() => {
      const bookingCall = calls.find(c => c.name === "applyBooking");
      assert.ok(bookingCall, "applyBooking was called");
      const receivedPlan = bookingCall!.args[0] as ChangePlan;
      assert.equal(
        receivedPlan.bookingDefault?.availability.monday.enabled,
        true,
        "Monday is enabled in the plan passed to applyBooking"
      );
      assert.equal(
        receivedPlan.bookingDefault?.availability.sunday.enabled,
        false,
        "Sunday is disabled in the plan passed to applyBooking"
      );
      assert.equal(receivedPlan.appointmentTypes.length, 2, "two appointment types in plan");
    });
  });

  it("importContacts received a plan carrying the contacts_file URL", () => {
    const plan = buildChangePlan(submissionData);
    const { deps, calls } = buildMockDeps();

    return applyChangePlan("org-test", plan, deps).then(() => {
      const contactsCall = calls.find(c => c.name === "importContacts");
      assert.ok(contactsCall, "importContacts was called");
      const receivedPlan = contactsCall!.args[0] as ChangePlan;
      assert.equal(
        receivedPlan.contactsFileUrl,
        "https://blob.vercel-storage.com/contacts-abc123.csv",
        "contactsFileUrl passed through to importContacts"
      );
    });
  });

  it("applyTheme received a plan with the extracted brand colors", () => {
    const plan = buildChangePlan(submissionData);
    const { deps, calls } = buildMockDeps();

    return applyChangePlan("org-test", plan, deps).then(() => {
      const themeCall = calls.find(c => c.name === "applyTheme");
      assert.ok(themeCall, "applyTheme was called");
      const receivedPlan = themeCall!.args[0] as ChangePlan;
      assert.equal(receivedPlan.theme?.primaryColor, "#1a7a6e");
      assert.equal(receivedPlan.theme?.accentColor, "#f4a261");
    });
  });

  it("a single surface failure does not abort the remaining surfaces", async () => {
    const plan = buildChangePlan(submissionData);
    const calls: string[] = [];

    const faultyDeps: ApplyChangePlanDeps = {
      async writeSoul() { calls.push("writeSoul"); throw new Error("db timeout"); },
      async seedLanding() { calls.push("seedLanding"); },
      async applyBooking() { calls.push("applyBooking"); },
      async applyTheme() { calls.push("applyTheme"); },
      async refreshChatbot() { calls.push("refreshChatbot"); },
      async importContacts() { calls.push("importContacts"); },
    };

    const result = await applyChangePlan("org-test", plan, faultyDeps);

    // All 6 surfaces ran despite the first one failing
    assert.deepEqual(
      calls,
      ["writeSoul", "seedLanding", "applyBooking", "applyTheme", "refreshChatbot", "importContacts"]
    );
    // Failed surface
    assert.equal(result.soul.ok, false);
    assert.ok(result.soul.error?.includes("db timeout"), "error message forwarded");
    // Remaining surfaces succeeded
    assert.equal(result.landing.ok, true);
    assert.equal(result.booking.ok, true);
    assert.equal(result.theme.ok, true);
    assert.equal(result.chatbot.ok, true);
    assert.equal(result.contacts.ok, true);
  });

  it("end-to-end: summaries mention all configured surfaces", () => {
    const plan = buildChangePlan(submissionData);
    const joined = plan.summaries.join("\n").toLowerCase();
    assert.ok(joined.includes("website") || joined.includes("landing"), "landing summary present");
    assert.ok(joined.includes("booking"), "booking summary present");
    assert.ok(joined.includes("service"), "services summary present");
    assert.ok(joined.includes("crm") || joined.includes("contact"), "contacts summary present");
    assert.ok(joined.includes("domain"), "domain summary present");
    assert.ok(joined.includes("call"), "call handling summary present");
    assert.ok(joined.includes("theme") || joined.includes("brand"), "theme summary present");
  });
});
