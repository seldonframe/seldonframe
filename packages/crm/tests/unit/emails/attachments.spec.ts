// 2026-06-21 — Email attachments thread-through (additive).
//
// Proves that an optional `attachments` array on the Resend provider's
// send() is forwarded into the Resend API request body when present, and
// OMITTED (no `attachments` key) when absent — so existing callers that
// don't pass attachments produce a byte-for-byte identical request.
//
// We DI the `fetcher` (matching the pattern in lib/notifications/
// ops-notifications.ts + lib/emails/welcome.ts) so the test never reaches
// the network. The Resend provider is the integration point that maps our
// EmailAttachment shape onto Resend's wire format, so testing it here gives
// the strongest guarantee for the .ics calendar invite.

import { test } from "node:test";
import assert from "node:assert/strict";

import { resendProvider } from "../../../src/lib/emails/providers/resend.ts";
import type { EmailSendRequest } from "../../../src/lib/emails/providers/interface.ts";

type CapturedBody = {
  from?: string;
  to?: string[];
  subject?: string;
  // Resend's wire format uses snake_case `content_type`.
  attachments?: Array<{ filename: string; content: string; content_type?: string }>;
};

function makeFetcher(): { fetcher: typeof fetch; bodies: CapturedBody[] } {
  const bodies: CapturedBody[] = [];
  const fetcher = (async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as CapturedBody);
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "resend-test-123" }),
    } as Response;
  }) as unknown as typeof fetch;
  return { fetcher, bodies };
}

const baseReq: EmailSendRequest = {
  orgId: "org-1",
  from: "hello@acme.test",
  to: "pat@example.test",
  subject: "Your appointment",
  html: "<p>hi</p>",
  text: "hi",
  apiKeyOverride: "re_test_key",
};

test("forwards attachments into the Resend request body when supplied", async () => {
  const { fetcher, bodies } = makeFetcher();
  const result = await resendProvider.send({
    ...baseReq,
    fetcher,
    attachments: [
      {
        filename: "appointment.ics",
        content: Buffer.from("BEGIN:VCALENDAR").toString("base64"),
        contentType: "text/calendar; method=REQUEST",
      },
    ],
  });

  assert.equal(result.externalMessageId, "resend-test-123");
  assert.equal(bodies.length, 1);
  assert.ok(Array.isArray(bodies[0].attachments));
  assert.equal(bodies[0].attachments!.length, 1);
  assert.equal(bodies[0].attachments![0].filename, "appointment.ics");
  assert.equal(bodies[0].attachments![0].content_type, "text/calendar; method=REQUEST");
});

test("omits the attachments key entirely when not supplied (byte-for-byte legacy)", async () => {
  const { fetcher, bodies } = makeFetcher();
  await resendProvider.send({ ...baseReq, fetcher });

  assert.equal(bodies.length, 1);
  assert.ok(
    !("attachments" in bodies[0]),
    "no attachments key should be present in the legacy send body",
  );
});

test("omits attachments when an empty array is supplied", async () => {
  const { fetcher, bodies } = makeFetcher();
  await resendProvider.send({ ...baseReq, fetcher, attachments: [] });

  assert.equal(bodies.length, 1);
  assert.ok(
    !("attachments" in bodies[0]),
    "an empty attachments array should not be forwarded",
  );
});
