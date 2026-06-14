import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { leadFormConfirmation } from "@/components/landing-r1/sections/lead-form";

describe("leadFormConfirmation", () => {
  test("SMS sent → greets by name and says we texted a booking link", () => {
    const c = leadFormConfirmation({
      name: "Dana Reyes",
      smsSent: true,
      bookUrl: "https://x.app.seldonframe.com/book",
    });
    assert.match(c.headline, /Got it/i);
    assert.match(c.headline, /Dana/); // first name only
    assert.match(c.body, /text/i);
    // No book button when we already texted the link.
    assert.equal(c.showBookButton, false);
  });

  test("no SMS → invites them to book instantly and surfaces the book URL", () => {
    const c = leadFormConfirmation({
      name: "Dana Reyes",
      smsSent: false,
      bookUrl: "https://x.app.seldonframe.com/book",
    });
    assert.match(c.headline, /Got it/i);
    assert.match(c.body, /book/i);
    assert.equal(c.showBookButton, true);
    assert.equal(c.bookUrl, "https://x.app.seldonframe.com/book");
  });

  test("empty name degrades gracefully (no 'undefined')", () => {
    const c = leadFormConfirmation({ name: "", smsSent: true, bookUrl: "" });
    assert.ok(!/undefined/.test(c.headline));
  });
});
