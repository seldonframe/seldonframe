import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { extractDialedNumber } from "../../../../src/lib/agents/voice/sip-headers";

describe("extractDialedNumber", () => {
  test("extracts the real Twilio→OpenAI SIP payload (dialed number is in Diversion)", () => {
    // Verbatim-shaped subset of a real realtime.call.incoming sip_headers:
    // To = OpenAI project URI (NOT a number), From/PAI/Contact = the CALLER,
    // Diversion = the originally-dialed Twilio DID. Must return the dialed DID.
    const headers = [
      { name: "From", value: "<sip:+14505161803@pstn.twilio.com:5060>;tag=65607834" },
      { name: "To", value: "<sip:proj_aC5QMBA19RqHxCKoFdyYKGPC@sip.api.openai.com;transport=tls>;tag=59f649d2" },
      { name: "P-Asserted-Identity", value: "<sip:+14505161803@184.150.215.12:5060>" },
      { name: "Diversion", value: "<sip:+13254132487@twilio.com>;reason=unconditional" },
      { name: "Contact", value: "<sip:+14505161803@172.25.28.249:5060;transport=udp>" },
    ];
    const dialed = extractDialedNumber(headers);
    assert.equal(dialed, "+13254132487", `expected the dialed DID, got ${dialed}`);
    // Must NOT return the caller's number.
    assert.notEqual(dialed, "+14505161803");
  });

  test("ignores the OpenAI project URI in To (it is the session target, not a number)", () => {
    // To points at sip.api.openai.com and there is no Diversion → null, so the
    // caller falls back to the env workspace rather than mis-resolving.
    const headers = [
      { name: "To", value: "<sip:proj_aC5QMBA19RqHxCKoFdyYKGPC@sip.api.openai.com;transport=tls>" },
      { name: "From", value: "<sip:+14505161803@pstn.twilio.com:5060>" },
    ];
    assert.equal(extractDialedNumber(headers), null);
  });

  test("prefers Diversion over To when both carry a number", () => {
    const headers = [
      { name: "To", value: "<sip:+18330000000@some-trunk.com>" },
      { name: "Diversion", value: "<sip:+13254132487@twilio.com>;reason=unconditional" },
    ];
    assert.equal(extractDialedNumber(headers), "+13254132487");
  });

  test("falls back to a To: PSTN URI when there is no Diversion", () => {
    const headers = [
      { name: "From", value: "<sip:+15125550111@twilio>" },
      { name: "To", value: "<sip:+18335551234@some-trunk.com>" },
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
