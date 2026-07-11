import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { scrubStepLabel, scrubStepLabels } from "@/lib/share/scrub-step-label";

describe("scrubStepLabel", () => {
  test("strips an email address", () => {
    assert.equal(scrubStepLabel("Email jane@acme.com the quote"), "Email [email] the quote");
  });

  test("strips a URL (http/https and bare www.)", () => {
    assert.equal(scrubStepLabel("Open https://acme.com/quote"), "Open [link]");
    assert.equal(scrubStepLabel("Visit www.acme.com now"), "Visit [link] now");
  });

  test("strips a phone number", () => {
    assert.equal(scrubStepLabel("Call 555-123-4567"), "Call [phone]");
    assert.equal(scrubStepLabel("Text +1 (555) 123 4567"), "Text [phone]");
  });

  test("non-string / empty input -> ''", () => {
    assert.equal(scrubStepLabel(null), "");
    assert.equal(scrubStepLabel(undefined), "");
    assert.equal(scrubStepLabel(""), "");
  });

  test("caps very long labels", () => {
    const long = "x".repeat(200);
    const scrubbed = scrubStepLabel(long);
    assert.ok(scrubbed.length <= 120);
    assert.ok(scrubbed.endsWith("…"));
  });

  test("leaves an ordinary label untouched", () => {
    assert.equal(scrubStepLabel("Check the inbox for new leads"), "Check the inbox for new leads");
  });
});

describe("scrubStepLabels", () => {
  test("scrubs every label and drops empties after scrubbing", () => {
    const out = scrubStepLabels(["Check the inbox", "", null, "Send jane@acme.com the reply"]);
    assert.deepEqual(out, ["Check the inbox", "Send [email] the reply"]);
  });

  test("caps at maxSteps", () => {
    const labels = Array.from({ length: 20 }, (_, i) => `step ${i}`);
    assert.equal(scrubStepLabels(labels, 8).length, 8);
  });
});
