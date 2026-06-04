import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildChangePlan } from "../../../src/lib/onboarding/change-plan";

const data = {
  business_name: "Calm Hands Massage", tagline: "Therapeutic massage in Austin",
  phone: "(512) 555-0100", email: "hi@calmhands.com",
  has_public_address: "Yes", address: "123 Main St, Austin TX",
  hours_text: "Mon-Fri 9-5, Sat 10-2, closed Sun",
  services_text: "60-min massage — $90\nDeep tissue (90 min) - $130",
  primary_service: "60-min massage",
  call_handling: "I answer — text me missed callers",
  lead_routing: ["Email", "Text"],
  has_domain: "Yes", domain: "calmhands.com",
  contacts_file: "https://blob/contacts.csv",
};

describe("buildChangePlan", () => {
  it("maps answers into a structured change plan", () => {
    const plan = buildChangePlan(data);
    assert.equal(plan.soul.business_name, "Calm Hands Massage");
    assert.equal(plan.soul.tagline, "Therapeutic massage in Austin");
    assert.equal(plan.bookingDefault?.availability.monday.enabled, true);
    assert.equal(plan.bookingDefault?.availability.sunday.enabled, false);
    assert.equal(plan.appointmentTypes.length, 2);
    assert.deepEqual(plan.appointmentTypes[0], { title: "massage", durationMinutes: 60, price: 90 });
    assert.equal(plan.callHandling, "human_then_text");
    assert.deepEqual(plan.leadRouting, ["email", "text"]);
    assert.equal(plan.domain, "calmhands.com");
    assert.equal(plan.contactsFileUrl, "https://blob/contacts.csv");
    assert.ok(plan.summaries.length > 0);
  });
  it("omits domain when has_domain is No", () => {
    const plan = buildChangePlan({ ...data, has_domain: "No", domain: "" });
    assert.equal(plan.domain, undefined);
  });
});
