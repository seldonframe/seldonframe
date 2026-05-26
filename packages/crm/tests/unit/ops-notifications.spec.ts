// Unit tests for the operations-notification helper — fires real-time
// emails to the founder when (a) a new free signup lands, and (b) a
// user converts to a paid plan. See:
//   - lib/notifications/ops-notifications.ts (helper)
//   - lib/auth/config.ts (events.createUser hook → signup alert)
//   - app/api/stripe/webhook/route.ts (customer.subscription.created → paid alert)
//
// Why an injectable `fetcher`: matches the pattern in
// lib/emails/welcome.ts so tests don't reach the network. A fetcher
// stub returning a successful Resend response is sufficient because
// the helper does not parse the response payload (fire-and-forget).
//
// Why try/catch around every send: a Resend outage MUST NOT break the
// signup flow (NextAuth events.createUser would propagate) or the
// Stripe webhook (a non-2xx makes Stripe retry, which would double-
// process the subscription). See the no-throw test below.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  OPS_NOTIFICATION_EMAIL_DEFAULT,
  resolveOpsNotificationRecipient,
  sendNewSignupAlert,
  sendPaidConversionAlert,
  formatMrr,
} from "@/lib/notifications/ops-notifications";

describe("resolveOpsNotificationRecipient", () => {
  test("falls back to the hardcoded default when env var is unset", () => {
    const recipient = resolveOpsNotificationRecipient({});
    assert.equal(recipient, OPS_NOTIFICATION_EMAIL_DEFAULT);
    assert.equal(recipient, "maximehoule100@gmail.com");
  });

  test("OPS_NOTIFICATION_EMAIL env var wins over the default", () => {
    const recipient = resolveOpsNotificationRecipient({
      OPS_NOTIFICATION_EMAIL: "ops-pager@seldonframe.com",
    });
    assert.equal(recipient, "ops-pager@seldonframe.com");
  });

  test("empty / whitespace OPS_NOTIFICATION_EMAIL is ignored", () => {
    assert.equal(resolveOpsNotificationRecipient({ OPS_NOTIFICATION_EMAIL: "" }), OPS_NOTIFICATION_EMAIL_DEFAULT);
    assert.equal(resolveOpsNotificationRecipient({ OPS_NOTIFICATION_EMAIL: "   " }), OPS_NOTIFICATION_EMAIL_DEFAULT);
  });

  test("trims whitespace from the env override", () => {
    const recipient = resolveOpsNotificationRecipient({
      OPS_NOTIFICATION_EMAIL: "  alerts@seldonframe.com  ",
    });
    assert.equal(recipient, "alerts@seldonframe.com");
  });
});

describe("formatMrr", () => {
  test("USD cents formats with $ symbol and two decimals", () => {
    assert.equal(formatMrr(2900, "usd"), "USD $29.00");
    assert.equal(formatMrr(9900, "usd"), "USD $99.00");
  });

  test("handles non-USD currencies with uppercase code (no symbol)", () => {
    assert.equal(formatMrr(2500, "eur"), "EUR 25.00");
  });

  test("handles fractional cents (rare but possible)", () => {
    assert.equal(formatMrr(2950, "usd"), "USD $29.50");
  });

  test("zero cents formats as $0.00 (defensive)", () => {
    assert.equal(formatMrr(0, "usd"), "USD $0.00");
  });
});

describe("sendNewSignupAlert", () => {
  test("posts to Resend with the right to, subject, text, html", async () => {
    type Captured = { url: string; init: RequestInit | undefined };
    const captured: Captured[] = [];
    const fakeFetcher = async (url: string | URL | Request, init?: RequestInit) => {
      captured.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: "msg_ops_signup_1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    await sendNewSignupAlert(
      {
        email: "founder@acme.test",
        userId: "u_abc123",
        createdAt: new Date("2026-05-26T15:00:00Z"),
        source: "google-search",
      },
      {
        fetcher: fakeFetcher as typeof fetch,
        apiKey: "test-resend-key",
        env: {},
      },
    );

    assert.equal(captured.length, 1, "Resend fetcher was never called");
    const call = captured[0];
    assert.equal(call.url, "https://api.resend.com/emails");

    const headers = call.init?.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer test-resend-key");
    assert.equal(headers["Content-Type"], "application/json");

    const body = JSON.parse(String(call.init?.body));
    assert.deepEqual(body.to, ["maximehoule100@gmail.com"]);
    assert.match(body.subject, /New SeldonFrame signup: founder@acme\.test/);
    // Text body contains every field
    assert.match(body.text, /founder@acme\.test/);
    assert.match(body.text, /u_abc123/);
    assert.match(body.text, /2026-05-26T15:00:00\.000Z/);
    assert.match(body.text, /google-search/);
    // HTML body is non-empty and includes the email
    assert.ok(body.html.length > 0);
    assert.match(body.html, /founder@acme\.test/);
  });

  test("source falls back to 'direct' when omitted", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const fakeFetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    };

    await sendNewSignupAlert(
      {
        email: "x@y.z",
        userId: "u_x",
        createdAt: new Date("2026-05-26T00:00:00Z"),
      },
      { fetcher: fakeFetcher as typeof fetch, apiKey: "k", env: {} },
    );

    assert.ok(capturedBody !== null);
    assert.match(String((capturedBody as Record<string, unknown>).text), /direct/);
  });

  test("OPS_NOTIFICATION_EMAIL env override wins for the recipient", async () => {
    let capturedTo: string[] = [];
    const fakeFetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      capturedTo = body.to;
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    };

    await sendNewSignupAlert(
      {
        email: "a@b.c",
        userId: "u",
        createdAt: new Date("2026-05-26T00:00:00Z"),
      },
      {
        fetcher: fakeFetcher as typeof fetch,
        apiKey: "k",
        env: { OPS_NOTIFICATION_EMAIL: "ops@seldonframe.com" },
      },
    );

    assert.deepEqual(capturedTo, ["ops@seldonframe.com"]);
  });

  test("does NOT throw when Resend returns 5xx (must not break signup)", async () => {
    const fakeFetcher = async () =>
      new Response(JSON.stringify({ message: "boom" }), { status: 503 });

    await assert.doesNotReject(() =>
      sendNewSignupAlert(
        {
          email: "x@y.z",
          userId: "u",
          createdAt: new Date(),
        },
        { fetcher: fakeFetcher as typeof fetch, apiKey: "k", env: {} },
      ),
    );
  });

  test("does NOT throw when the fetcher itself rejects (network error)", async () => {
    const fakeFetcher = async () => {
      throw new Error("network down");
    };

    await assert.doesNotReject(() =>
      sendNewSignupAlert(
        {
          email: "x@y.z",
          userId: "u",
          createdAt: new Date(),
        },
        { fetcher: fakeFetcher as typeof fetch, apiKey: "k", env: {} },
      ),
    );
  });

  test("does NOT throw when apiKey is missing (no-op send, log only)", async () => {
    let called = false;
    const fakeFetcher = async () => {
      called = true;
      return new Response("{}", { status: 200 });
    };

    await assert.doesNotReject(() =>
      sendNewSignupAlert(
        { email: "x@y.z", userId: "u", createdAt: new Date() },
        { fetcher: fakeFetcher as typeof fetch, apiKey: "", env: {} },
      ),
    );
    assert.equal(called, false, "fetcher should not be invoked when apiKey is empty");
  });
});

describe("sendPaidConversionAlert", () => {
  test("formats subject and body with email, tier, MRR and subscription id", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const fakeFetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: "msg_ops_paid_1" }), { status: 200 });
    };

    await sendPaidConversionAlert(
      {
        email: "founder@acme.test",
        userId: "u_abc",
        tier: "Growth",
        mrrCents: 2900,
        currency: "usd",
        subscriptionId: "sub_test_123",
        signupToPaidDays: 7,
      },
      { fetcher: fakeFetcher as typeof fetch, apiKey: "k", env: {} },
    );

    assert.ok(capturedBody !== null);
    const body = capturedBody as Record<string, string | string[]>;
    assert.deepEqual(body.to, ["maximehoule100@gmail.com"]);
    // Subject uses the money emoji + arrow format
    assert.match(String(body.subject), /Paid conversion: founder@acme\.test → Growth \(USD \$29\.00\/mo\)/);
    // Text body has the structured fields
    assert.match(String(body.text), /Tier: Growth/);
    assert.match(String(body.text), /MRR: USD \$29\.00\/mo/);
    assert.match(String(body.text), /sub_test_123/);
    assert.match(String(body.text), /Signup → paid: 7 days/);
  });

  test("omits signupToPaidDays from body when not provided", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const fakeFetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    };

    await sendPaidConversionAlert(
      {
        email: "a@b.c",
        userId: "u",
        tier: "Scale",
        mrrCents: 9900,
        currency: "usd",
        subscriptionId: "sub_x",
      },
      { fetcher: fakeFetcher as typeof fetch, apiKey: "k", env: {} },
    );

    assert.ok(capturedBody !== null);
    const text = String((capturedBody as Record<string, unknown>).text);
    assert.doesNotMatch(text, /Signup → paid/);
    assert.match(text, /Tier: Scale/);
    assert.match(text, /MRR: USD \$99\.00/);
  });

  test("does NOT throw when Resend fails (Stripe must not retry the webhook)", async () => {
    const fakeFetcher = async () =>
      new Response(JSON.stringify({ message: "boom" }), { status: 500 });

    await assert.doesNotReject(() =>
      sendPaidConversionAlert(
        {
          email: "x@y.z",
          userId: "u",
          tier: "Growth",
          mrrCents: 2900,
          currency: "usd",
          subscriptionId: "sub",
        },
        { fetcher: fakeFetcher as typeof fetch, apiKey: "k", env: {} },
      ),
    );
  });

  test("OPS_NOTIFICATION_EMAIL env override wins for the recipient", async () => {
    let capturedTo: string[] = [];
    const fakeFetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      capturedTo = body.to;
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    };

    await sendPaidConversionAlert(
      {
        email: "a@b.c",
        userId: "u",
        tier: "Growth",
        mrrCents: 2900,
        currency: "usd",
        subscriptionId: "sub_x",
      },
      {
        fetcher: fakeFetcher as typeof fetch,
        apiKey: "k",
        env: { OPS_NOTIFICATION_EMAIL: "ops@seldonframe.com" },
      },
    );

    assert.deepEqual(capturedTo, ["ops@seldonframe.com"]);
  });

  test("EUR currency formats without dollar sign", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const fakeFetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    };

    await sendPaidConversionAlert(
      {
        email: "eu@user.test",
        userId: "u",
        tier: "Growth",
        mrrCents: 2500,
        currency: "eur",
        subscriptionId: "sub_eu",
      },
      { fetcher: fakeFetcher as typeof fetch, apiKey: "k", env: {} },
    );

    assert.ok(capturedBody !== null);
    const text = String((capturedBody as unknown as Record<string, unknown>).text);
    assert.match(text, /MRR: EUR 25\.00\/mo/);
    assert.doesNotMatch(text, /\$25/);
  });
});
