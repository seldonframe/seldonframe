// Unit tests for the onboarding-welcome email surface — fired by the MCP
// `send_welcome_email` tool after the user confirms an email post-
// `create_workspace`. The route at /api/v1/email/send-welcome is a thin
// orchestrator over the helpers tested here.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  pickFromAddress,
  renderWelcomeEmailHtml,
  renderWelcomeEmailText,
  sendWelcomeEmail,
  validateWelcomeRequest,
} from "@/lib/emails/welcome";

const VALID_BODY = {
  email: "alice@example.com",
  name: "Alice",
  workspace: {
    landing_url: "https://acme.app.seldonframe.com/",
    booking_url: "https://acme.app.seldonframe.com/book",
    intake_url: "https://acme.app.seldonframe.com/intake",
    admin_url: "https://app.seldonframe.com/admin/wsp_xyz?token=abc",
  },
};

describe("validateWelcomeRequest", () => {
  test("missing email → 400", () => {
    const { workspace } = VALID_BODY;
    const result = validateWelcomeRequest({ workspace });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.match(result.error, /email/i);
    }
  });

  test("empty-string email → 400", () => {
    const result = validateWelcomeRequest({ ...VALID_BODY, email: "   " });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
  });

  test("non-string email → 400", () => {
    const result = validateWelcomeRequest({ ...VALID_BODY, email: 42 });
    assert.equal(result.ok, false);
  });

  test("missing workspace entirely → 400", () => {
    const result = validateWelcomeRequest({ email: "a@b.com" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.match(result.error, /workspace/i);
    }
  });

  test("missing workspace.landing_url → 400", () => {
    const result = validateWelcomeRequest({
      ...VALID_BODY,
      workspace: { ...VALID_BODY.workspace, landing_url: undefined },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.match(result.error, /landing_url/i);
    }
  });

  test("missing workspace.booking_url → 400", () => {
    const result = validateWelcomeRequest({
      ...VALID_BODY,
      workspace: { ...VALID_BODY.workspace, booking_url: undefined },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /booking_url/i);
  });

  test("missing workspace.intake_url → 400", () => {
    const result = validateWelcomeRequest({
      ...VALID_BODY,
      workspace: { ...VALID_BODY.workspace, intake_url: undefined },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /intake_url/i);
  });

  test("missing workspace.admin_url → 400", () => {
    const result = validateWelcomeRequest({
      ...VALID_BODY,
      workspace: { ...VALID_BODY.workspace, admin_url: undefined },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /admin_url/i);
  });

  test("valid input → ok", () => {
    const result = validateWelcomeRequest(VALID_BODY);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.email, "alice@example.com");
      assert.equal(result.data.name, "Alice");
      assert.equal(result.data.workspace.admin_url, VALID_BODY.workspace.admin_url);
    }
  });

  test("name is optional", () => {
    const result = validateWelcomeRequest({
      email: VALID_BODY.email,
      workspace: VALID_BODY.workspace,
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.name, null);
  });
});

describe("pickFromAddress", () => {
  test("uses RESEND_FROM_ADDRESS when it points at the verified seldonframe.com domain", () => {
    const result = pickFromAddress({
      RESEND_FROM_ADDRESS: "SeldonFrame <onboarding@seldonframe.com>",
    });
    assert.equal(result, "SeldonFrame <onboarding@seldonframe.com>");
  });

  test("trims whitespace from RESEND_FROM_ADDRESS (when domain is verified)", () => {
    const result = pickFromAddress({
      RESEND_FROM_ADDRESS: "  Foo <foo@seldonframe.com>  ",
    });
    assert.equal(result, "Foo <foo@seldonframe.com>");
  });

  test("falls back to welcome@seldonframe.com (verified domain) when not set", () => {
    // v1.1.4 / Issue #4 — the legacy onboarding@resend.dev sandbox
    // address is rate-limited to 3/day and only delivers to the account
    // owner. The verified seldonframe.com domain delivers to any operator.
    const result = pickFromAddress({});
    assert.match(result, /welcome@seldonframe\.com/);
  });

  test("falls back when RESEND_FROM_ADDRESS is empty", () => {
    const result = pickFromAddress({ RESEND_FROM_ADDRESS: "   " });
    assert.match(result, /welcome@seldonframe\.com/);
  });

  test("v1.1.7 — IGNORES the resend.dev sandbox address (forces verified domain)", () => {
    // Production deployments stuck with the legacy
    // onboarding@resend.dev fallback (sandbox-only, can't deliver
    // to non-account-owner emails). pickFromAddress must override.
    const result = pickFromAddress({
      RESEND_FROM_ADDRESS: "SeldonFrame <onboarding@resend.dev>",
    });
    assert.match(result, /welcome@seldonframe\.com/);
    assert.doesNotMatch(result, /resend\.dev/);
  });

  test("v1.1.8 — IGNORES non-seldonframe.com env overrides (env drift guard)", () => {
    // A staging/preview deployment with a misconfigured
    // RESEND_FROM_ADDRESS like noreply@example.com would be rejected
    // by Resend (unverified domain). Forcing the verified default
    // makes the welcome email path resilient to env drift.
    const result = pickFromAddress({
      RESEND_FROM_ADDRESS: "Generic <noreply@example.com>",
    });
    assert.match(result, /welcome@seldonframe\.com/);
    assert.doesNotMatch(result, /example\.com/);
  });
});

describe("renderWelcomeEmailHtml", () => {
  test("includes all 4 workspace URLs", () => {
    const html = renderWelcomeEmailHtml(VALID_BODY);
    assert.ok(html.includes(VALID_BODY.workspace.landing_url), "landing_url missing");
    assert.ok(html.includes(VALID_BODY.workspace.booking_url), "booking_url missing");
    assert.ok(html.includes(VALID_BODY.workspace.intake_url), "intake_url missing");
    assert.ok(html.includes(VALID_BODY.workspace.admin_url), "admin_url missing");
  });

  test("includes Discord community link", () => {
    const html = renderWelcomeEmailHtml(VALID_BODY);
    assert.match(html, /discord\.gg\/sbVUu976NW/);
  });

  test("greets recipient by name when provided", () => {
    const html = renderWelcomeEmailHtml(VALID_BODY);
    assert.match(html, /Alice/);
  });

  test("falls back to a generic greeting when name is null", () => {
    const html = renderWelcomeEmailHtml({ ...VALID_BODY, name: null });
    assert.doesNotMatch(html, /Hi ,/);
  });

  test("escapes HTML in name to prevent injection", () => {
    const html = renderWelcomeEmailHtml({
      ...VALID_BODY,
      name: "<script>alert(1)</script>",
    });
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /&lt;script&gt;/);
  });
});

describe("renderWelcomeEmailText", () => {
  test("plain-text version includes all 4 URLs", () => {
    const text = renderWelcomeEmailText(VALID_BODY);
    assert.ok(text.includes(VALID_BODY.workspace.landing_url));
    assert.ok(text.includes(VALID_BODY.workspace.booking_url));
    assert.ok(text.includes(VALID_BODY.workspace.intake_url));
    assert.ok(text.includes(VALID_BODY.workspace.admin_url));
  });
});

describe("chatbot card — HTML", () => {
  const CHATBOT_LIVE = {
    url: "https://acme.app.seldonframe.com/chat",
    embed_snippet: '<script src="https://acme.app.seldonframe.com/embed.js" async></script>',
    status: "live" as const,
  };
  const CHATBOT_TEST = { ...CHATBOT_LIVE, status: "test" as const };

  test("renders the AI Chatbot card when chatbot is provided (live)", () => {
    const html = renderWelcomeEmailHtml({
      ...VALID_BODY,
      workspace: { ...VALID_BODY.workspace, chatbot: CHATBOT_LIVE },
    });
    assert.match(html, /AI Chatbot/);
    assert.ok(html.includes(CHATBOT_LIVE.url));
    assert.match(html, /It&#39;s live and answering now\.|It's live and answering now\./);
    assert.doesNotMatch(html, /test mode/);
  });

  test("renders the AI Chatbot card when chatbot is provided (test)", () => {
    const html = renderWelcomeEmailHtml({
      ...VALID_BODY,
      workspace: { ...VALID_BODY.workspace, chatbot: CHATBOT_TEST },
    });
    assert.match(html, /AI Chatbot/);
    assert.match(html, /test mode/);
    assert.match(html, /publish_agent/);
  });

  test("escapes the embed snippet", () => {
    const html = renderWelcomeEmailHtml({
      ...VALID_BODY,
      workspace: { ...VALID_BODY.workspace, chatbot: CHATBOT_LIVE },
    });
    assert.doesNotMatch(html, /<script src="https:\/\/acme\.app\.seldonframe\.com\/embed\.js" async><\/script>/);
    assert.match(html, /&lt;script/);
  });

  test("card fully absent when chatbot is omitted", () => {
    const html = renderWelcomeEmailHtml(VALID_BODY);
    assert.doesNotMatch(html, /AI Chatbot/);
  });
});

describe("chatbot card — text", () => {
  const CHATBOT_LIVE = {
    url: "https://acme.app.seldonframe.com/chat",
    embed_snippet: '<script src="https://acme.app.seldonframe.com/embed.js" async></script>',
    status: "live" as const,
  };

  test("includes chatbot url + snippet + live status note", () => {
    const text = renderWelcomeEmailText({
      ...VALID_BODY,
      workspace: { ...VALID_BODY.workspace, chatbot: CHATBOT_LIVE },
    });
    assert.ok(text.includes(CHATBOT_LIVE.url));
    assert.ok(text.includes(CHATBOT_LIVE.embed_snippet));
    assert.match(text, /live and answering now/);
  });

  test("fully absent when chatbot is omitted", () => {
    const text = renderWelcomeEmailText(VALID_BODY);
    assert.doesNotMatch(text, /AI Chatbot/);
  });
});

describe("validateWelcomeRequest — chatbot", () => {
  test("valid chatbot passes through", () => {
    const result = validateWelcomeRequest({
      ...VALID_BODY,
      workspace: {
        ...VALID_BODY.workspace,
        chatbot: {
          url: "https://acme.app.seldonframe.com/chat",
          embed_snippet: "<script>...</script>",
          status: "test",
        },
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.data.workspace.chatbot, {
        url: "https://acme.app.seldonframe.com/chat",
        embed_snippet: "<script>...</script>",
        status: "test",
      });
    }
  });

  test("omitted chatbot is fine (backward-compatible)", () => {
    const result = validateWelcomeRequest(VALID_BODY);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.workspace.chatbot, undefined);
  });

  test("malformed chatbot (missing embed_snippet) → 400", () => {
    const result = validateWelcomeRequest({
      ...VALID_BODY,
      workspace: {
        ...VALID_BODY.workspace,
        chatbot: { url: "https://x.com", status: "live" },
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /embed_snippet/i);
  });

  test("malformed chatbot (bad status) → 400", () => {
    const result = validateWelcomeRequest({
      ...VALID_BODY,
      workspace: {
        ...VALID_BODY.workspace,
        chatbot: { url: "https://x.com", embed_snippet: "<script></script>", status: "draft" },
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /status/i);
  });

  test("malformed chatbot (not an object) → 400", () => {
    const result = validateWelcomeRequest({
      ...VALID_BODY,
      workspace: { ...VALID_BODY.workspace, chatbot: "nope" },
    });
    assert.equal(result.ok, false);
  });
});

describe("sendWelcomeEmail", () => {
  test("posts to api.resend.com with bearer auth and returns ok on 200", async () => {
    type Captured = { url: string; init: RequestInit | undefined };
    const captured: Captured[] = [];
    const fakeFetcher = async (url: string | URL | Request, init?: RequestInit) => {
      captured.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: "msg_abc123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const result = await sendWelcomeEmail(VALID_BODY, {
      fetcher: fakeFetcher as typeof fetch,
      apiKey: "test-resend-key",
      fromAddress: "SeldonFrame <onboarding@resend.dev>",
    });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.messageId, "msg_abc123");

    assert.equal(captured.length, 1, "fetcher was never called");
    const call = captured[0];
    assert.equal(call.url, "https://api.resend.com/emails");
    const headers = call.init?.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer test-resend-key");
    assert.equal(headers["Content-Type"], "application/json");

    const body = JSON.parse(String(call.init?.body));
    assert.equal(body.from, "SeldonFrame <onboarding@resend.dev>");
    assert.deepEqual(body.to, ["alice@example.com"]);
    assert.ok(body.subject);
    assert.ok(body.html);
    assert.ok(body.text);
  });

  test("returns ok:false on 4xx from Resend", async () => {
    const fakeFetcher = async () =>
      new Response(JSON.stringify({ message: "Invalid from address" }), {
        status: 422,
        headers: { "content-type": "application/json" },
      });

    const result = await sendWelcomeEmail(VALID_BODY, {
      fetcher: fakeFetcher as typeof fetch,
      apiKey: "test-key",
      fromAddress: "x@y.z",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 422);
      assert.match(result.error, /Invalid from address|Resend/);
    }
  });

  test("returns ok:false when Resend returns no id", async () => {
    const fakeFetcher = async () =>
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const result = await sendWelcomeEmail(VALID_BODY, {
      fetcher: fakeFetcher as typeof fetch,
      apiKey: "test-key",
      fromAddress: "x@y.z",
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 502);
  });
});

describe("POST /api/v1/email/send-welcome — demo readonly guard", () => {
  test("returns 403 when NEXT_PUBLIC_DEMO_READONLY is true", async () => {
    const original = process.env.NEXT_PUBLIC_DEMO_READONLY;
    process.env.NEXT_PUBLIC_DEMO_READONLY = "true";
    try {
      const { POST } = await import("@/app/api/v1/email/send-welcome/route");
      const request = new Request("http://localhost/api/v1/email/send-welcome", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_BODY),
      });
      const response = await POST(request);
      assert.equal(response.status, 403);
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_DEMO_READONLY;
      else process.env.NEXT_PUBLIC_DEMO_READONLY = original;
    }
  });
});
