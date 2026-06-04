import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyChangePlan } from "../../../src/lib/onboarding/execute-change-plan";

describe("applyChangePlan", () => {
  it("runs the surfaces in order and reports per-surface results", async () => {
    const calls: string[] = [];
    const deps = {
      writeSoul: async () => { calls.push("soul"); },
      seedLanding: async () => { calls.push("seedLanding"); },
      applyBooking: async () => { calls.push("booking"); },
      applyTheme: async () => { calls.push("theme"); },
      refreshChatbot: async () => { calls.push("chatbot"); },
      importContacts: async () => { calls.push("contacts"); },
    };
    const plan = { soul: {}, appointmentTypes: [], callHandling: "none" as const, leadRouting: [], summaries: [] };
    const result = await applyChangePlan("org-1", plan, deps);
    assert.deepEqual(calls, ["soul","seedLanding","booking","theme","chatbot","contacts"]);
    assert.equal(result.soul.ok, true);
  });
  it("a failing surface does not abort the others", async () => {
    const calls: string[] = [];
    const deps = {
      writeSoul: async () => { calls.push("soul"); throw new Error("boom"); },
      seedLanding: async () => { calls.push("seedLanding"); },
      applyBooking: async () => { calls.push("booking"); },
      applyTheme: async () => { calls.push("theme"); },
      refreshChatbot: async () => { calls.push("chatbot"); },
      importContacts: async () => { calls.push("contacts"); },
    };
    const plan = { soul: {}, appointmentTypes: [], callHandling: "none" as const, leadRouting: [], summaries: [] };
    const result = await applyChangePlan("org-1", plan, deps);
    assert.deepEqual(calls, ["soul","seedLanding","booking","theme","chatbot","contacts"]);
    assert.equal(result.soul.ok, false);
  });
});
