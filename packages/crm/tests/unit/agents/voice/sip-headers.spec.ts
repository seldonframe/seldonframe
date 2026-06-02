import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { extractDialedNumber } from "../../../../src/lib/agents/voice/sip-headers";

describe("extractDialedNumber", () => {
  test("pulls the E.164 number from a To: SIP URI", () => {
    const headers = [
      { name: "From", value: "<sip:+15125550111@twilio>" },
      { name: "To", value: "<sip:+18335551234@sip.api.openai.com>" },
    ];
    assert.equal(extractDialedNumber(headers), "+18335551234");
  });
  test("handles a tel: URI", () => {
    assert.equal(extractDialedNumber([{ name: "To", value: "tel:+18335551234" }]), "+18335551234");
  });
  test("is case-insensitive on the header name", () => {
    assert.equal(extractDialedNumber([{ name: "to", value: "<sip:+18335551234@x>" }]), "+18335551234");
  });
  test("returns null when no dialed-number header is present", () => {
    assert.equal(extractDialedNumber([{ name: "From", value: "<sip:+1512@x>" }]), null);
  });
  test("returns null for empty/garbage", () => {
    assert.equal(extractDialedNumber([]), null);
    assert.equal(extractDialedNumber([{ name: "To", value: "garbage" }]), null);
  });
});
