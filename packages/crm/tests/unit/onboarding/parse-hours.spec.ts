import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHoursText } from "../../../src/lib/onboarding/parse-hours";

describe("parseHoursText", () => {
  it("parses a weekday range with a Saturday and a closed Sunday", () => {
    const a = parseHoursText("Mon-Fri 9-5, Sat 10-2, closed Sun");
    assert.deepEqual(a.monday, { enabled: true, start: "09:00", end: "17:00" });
    assert.deepEqual(a.friday, { enabled: true, start: "09:00", end: "17:00" });
    assert.deepEqual(a.saturday, { enabled: true, start: "10:00", end: "14:00" });
    assert.equal(a.sunday.enabled, false);
  });
  it("defaults unmatched input to Mon-Fri 9-5, weekends off", () => {
    const a = parseHoursText("we're flexible");
    assert.equal(a.monday.enabled, true);
    assert.equal(a.saturday.enabled, false);
  });
});
