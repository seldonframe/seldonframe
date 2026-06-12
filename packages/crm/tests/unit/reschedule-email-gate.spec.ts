import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldSendRescheduleEmail } from "@/lib/bookings/calendar-math";

test("reschedule email sends only for a notified, contact-linked, non-blocked booking", () => {
  assert.equal(shouldSendRescheduleEmail({ notify: true, contactId: "c1", status: "scheduled" }), true);
  assert.equal(shouldSendRescheduleEmail({ notify: false, contactId: "c1", status: "scheduled" }), false);
  assert.equal(shouldSendRescheduleEmail({ notify: true, contactId: null, status: "scheduled" }), false);
  assert.equal(shouldSendRescheduleEmail({ notify: true, contactId: "c1", status: "blocked" }), false);
});
