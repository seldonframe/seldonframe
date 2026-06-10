import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPostCallSmsBody } from "@/lib/agents/voice/openai-realtime";
import { extractCallerNumber } from "@/lib/agents/voice/sip-headers";

// 2026-06-10 — META loop: when a voice call ends, the webhook texts the caller a
// booking link plus a light SeldonFrame pitch. Both helpers are pure so the
// post-call SMS behavior is unit-testable without a live call or Twilio.

test("buildPostCallSmsBody — meta variant frames the text itself as the demo", () => {
  const body = buildPostCallSmsBody({
    businessName: "Seldon Studio",
    bookUrl: "https://app.seldonframe.com/forms/seldon-studio/intake",
    includeMetaPitch: true,
  });
  assert.ok(body.includes("Seldon Studio"), body);
  assert.ok(body.includes("https://app.seldonframe.com/forms/seldon-studio/intake"), body);
  assert.ok(/demo/i.test(body), body);
});

test("buildPostCallSmsBody — clean variant is a plain booking nudge, no SeldonFrame ad", () => {
  const body = buildPostCallSmsBody({
    businessName: "Bayside Massage",
    bookUrl: "https://bayside-massage.app.seldonframe.com/book",
  });
  assert.ok(body.includes("Bayside Massage"), body);
  assert.ok(body.includes("https://bayside-massage.app.seldonframe.com/book"), body);
  // A client's customer must never get a SeldonFrame pitch.
  assert.ok(!/\bdemo\b/i.test(body), body);
  assert.ok(!/reply\s+demo/i.test(body), body);
});

test("buildPostCallSmsBody never leaks an undefined when the name is generic", () => {
  const body = buildPostCallSmsBody({
    businessName: "us",
    bookUrl: "https://acme.app.seldonframe.com/book",
  });
  assert.ok(body.startsWith("Thanks for calling us!"), body);
  assert.ok(!body.includes("undefined"), body);
});

test("extractCallerNumber reads the From header user part as E.164", () => {
  const headers = [
    { name: "From", value: "<sip:+14505161803@pstn.twilio.com:5060>;tag=abc" },
    { name: "To", value: "<sip:proj_x@sip.api.openai.com;transport=tls>" },
  ];
  assert.equal(extractCallerNumber(headers), "+14505161803");
});

test("extractCallerNumber prefers P-Asserted-Identity over From", () => {
  const headers = [
    { name: "From", value: "<sip:+14505161803@pstn.twilio.com:5060>;tag=abc" },
    { name: "P-Asserted-Identity", value: "<sip:+15145550123@206.147.72.73:5060>" },
  ];
  assert.equal(extractCallerNumber(headers), "+15145550123");
});

test("extractCallerNumber returns null for anonymous callers", () => {
  const headers = [
    { name: "From", value: '"Anonymous" <sip:anonymous@anonymous.invalid>;tag=z' },
  ];
  assert.equal(extractCallerNumber(headers), null);
});

test("extractCallerNumber returns null when no usable caller header exists", () => {
  assert.equal(extractCallerNumber(null), null);
  assert.equal(extractCallerNumber(undefined), null);
  assert.equal(extractCallerNumber([]), null);
  // A From pointing at the OpenAI endpoint is the session target, never a caller.
  assert.equal(
    extractCallerNumber([{ name: "From", value: "<sip:proj_x@sip.api.openai.com>" }]),
    null,
  );
});
