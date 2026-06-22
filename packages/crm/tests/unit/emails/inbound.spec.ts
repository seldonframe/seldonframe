// Multi-surface runtime — tests for the inbound-email helpers.
//
// Two pure / DI'd units used by the net-new inbound-email webhook:
//   1. parseInboundEmail(payload) — normalize a Resend Inbound payload
//      ({ type:"email.received", data:{ from, to, subject, text, html, ... } })
//      into { from, to, subject, text } | null. Robust to to[] arrays, missing
//      fields, and text/html fallback.
//   2. resolveOrgByInboundAddress(toAddress, deps) — map an inbound "to" address
//      to an orgId: FIRST by a verified custom domain (workspace_domains), ELSE
//      by the <slug>@inbound.<root> convention. DI'd → no DB.
//
// No network / DB / provider — everything injected.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  parseInboundEmail,
  resolveOrgByInboundAddress,
  handleInboundEmail,
  extractEmailDomain,
  extractLocalPart,
  type ResolveInboundAddressDeps,
  type HandleInboundEmailDeps,
} from "../../../src/lib/emails/inbound";
import type { InboundMessage } from "../../../src/lib/agents/channels/channel-adapter";

// ─── parseInboundEmail ──────────────────────────────────────────────────────

describe("parseInboundEmail", () => {
  test("parses a standard Resend Inbound payload", () => {
    const parsed = parseInboundEmail({
      type: "email.received",
      data: {
        from: "jane@example.com",
        to: "hello@acme.com",
        subject: "Booking question",
        text: "Do you have any openings Friday?",
        html: "<p>Do you have any openings Friday?</p>",
      },
    });
    assert.deepEqual(parsed, {
      from: "jane@example.com",
      to: "hello@acme.com",
      subject: "Booking question",
      text: "Do you have any openings Friday?",
    });
  });

  test("takes the first recipient when `to` is an array", () => {
    const parsed = parseInboundEmail({
      type: "email.received",
      data: { from: "a@b.com", to: ["hello@acme.com", "cc@acme.com"], subject: "Hi", text: "yo" },
    });
    assert.equal(parsed?.to, "hello@acme.com");
  });

  test("falls back to html (stripped) when text is missing", () => {
    const parsed = parseInboundEmail({
      type: "email.received",
      data: { from: "a@b.com", to: "x@y.com", subject: "S", html: "<p>Hello <b>there</b></p>" },
    });
    assert.equal(parsed?.text, "Hello there");
  });

  test("returns null when from / to / body cannot be resolved", () => {
    assert.equal(parseInboundEmail({ type: "email.received", data: { to: "x@y.com", text: "hi" } }), null);
    assert.equal(parseInboundEmail({ type: "email.received", data: { from: "a@b.com", text: "hi" } }), null);
    assert.equal(
      parseInboundEmail({ type: "email.received", data: { from: "a@b.com", to: "x@y.com" } }),
      null,
      "no text and no html → null",
    );
  });

  test("returns null for a non-inbound event type (e.g. an outbound status webhook)", () => {
    assert.equal(
      parseInboundEmail({ type: "email.delivered", data: { from: "a@b.com", to: "x@y.com", text: "hi" } }),
      null,
    );
  });

  test("returns null for garbage input", () => {
    assert.equal(parseInboundEmail(null), null);
    assert.equal(parseInboundEmail("nope"), null);
    assert.equal(parseInboundEmail({}), null);
  });
});

// ─── extractEmailDomain / extractLocalPart ──────────────────────────────────

describe("extract helpers", () => {
  test("extractEmailDomain lowercases + handles a display-name wrapper", () => {
    assert.equal(extractEmailDomain("hello@Acme.com"), "acme.com");
    assert.equal(extractEmailDomain("Jane Doe <jane@Example.COM>"), "example.com");
    assert.equal(extractEmailDomain("not-an-email"), null);
    assert.equal(extractEmailDomain(""), null);
  });

  test("extractLocalPart lowercases + handles a display-name wrapper", () => {
    assert.equal(extractLocalPart("Sunset-Plumbing@inbound.seldonframe.com"), "sunset-plumbing");
    assert.equal(extractLocalPart("Team <Hi@acme.com>"), "hi");
    assert.equal(extractLocalPart("nope"), null);
  });
});

// ─── resolveOrgByInboundAddress ─────────────────────────────────────────────

describe("resolveOrgByInboundAddress", () => {
  test("verified custom domain → workspace org id (preferred)", async () => {
    let slugLookups = 0;
    const deps: ResolveInboundAddressDeps = {
      findOrgIdByVerifiedDomain: async (domain) =>
        domain === "acme.com" ? "org-acme" : null,
      findOrgIdBySlug: async () => {
        slugLookups++;
        return null;
      },
      inboundRootDomain: "inbound.seldonframe.com",
    };

    const orgId = await resolveOrgByInboundAddress("hello@acme.com", deps);
    assert.equal(orgId, "org-acme");
    // Custom domain matched → slug fallback must not run.
    assert.equal(slugLookups, 0);
  });

  test("<slug>@inbound.<root> → org by slug (fallback when not a custom domain)", async () => {
    const deps: ResolveInboundAddressDeps = {
      findOrgIdByVerifiedDomain: async () => null,
      findOrgIdBySlug: async (slug) => (slug === "sunset-plumbing" ? "org-sunset" : null),
      inboundRootDomain: "inbound.seldonframe.com",
    };

    const orgId = await resolveOrgByInboundAddress(
      "sunset-plumbing@inbound.seldonframe.com",
      deps,
    );
    assert.equal(orgId, "org-sunset");
  });

  test("an address on the inbound root but with an unknown slug → null", async () => {
    const deps: ResolveInboundAddressDeps = {
      findOrgIdByVerifiedDomain: async () => null,
      findOrgIdBySlug: async () => null,
      inboundRootDomain: "inbound.seldonframe.com",
    };
    assert.equal(
      await resolveOrgByInboundAddress("ghost@inbound.seldonframe.com", deps),
      null,
    );
  });

  test("an unrelated external domain (not custom, not inbound root) → null", async () => {
    let slugLookups = 0;
    const deps: ResolveInboundAddressDeps = {
      findOrgIdByVerifiedDomain: async () => null,
      findOrgIdBySlug: async () => {
        slugLookups++;
        return null;
      },
      inboundRootDomain: "inbound.seldonframe.com",
    };
    assert.equal(await resolveOrgByInboundAddress("someone@gmail.com", deps), null);
    // gmail.com isn't the inbound root, so we don't even attempt a slug lookup.
    assert.equal(slugLookups, 0);
  });

  test("blank / malformed address → null (no lookups)", async () => {
    let calls = 0;
    const deps: ResolveInboundAddressDeps = {
      findOrgIdByVerifiedDomain: async () => {
        calls++;
        return null;
      },
      findOrgIdBySlug: async () => {
        calls++;
        return null;
      },
      inboundRootDomain: "inbound.seldonframe.com",
    };
    assert.equal(await resolveOrgByInboundAddress("", deps), null);
    assert.equal(await resolveOrgByInboundAddress("garbage", deps), null);
    assert.equal(calls, 0);
  });

  test("soft-fails to null when a lookup throws", async () => {
    const deps: ResolveInboundAddressDeps = {
      findOrgIdByVerifiedDomain: async () => {
        throw new Error("db down");
      },
      findOrgIdBySlug: async () => null,
      inboundRootDomain: "inbound.seldonframe.com",
    };
    assert.equal(await resolveOrgByInboundAddress("hello@acme.com", deps), null);
  });
});

// ─── handleInboundEmail (route orchestrator) ────────────────────────────────

const INBOUND_PAYLOAD = {
  type: "email.received",
  data: {
    from: "Jane Doe <jane@example.com>",
    to: "hello@acme.com",
    subject: "Booking question",
    text: "Do you have any openings Friday?",
  },
};

describe("handleInboundEmail", () => {
  test("resolves org + contact → runChannelTurn with the email adapter (subject in metadata)", async () => {
    const captured: InboundMessage[] = [];
    const deps: HandleInboundEmailDeps = {
      resolveOrgId: async (to) => (to === "hello@acme.com" ? "org-acme" : null),
      findContactByEmail: async (orgId, email) =>
        orgId === "org-acme" && email === "jane@example.com" ? "contact-3" : null,
      runChannelTurn: async (inbound) => {
        captured.push(inbound);
        return { handled: true, conversationId: "conv-em" };
      },
    };

    const out = await handleInboundEmail(INBOUND_PAYLOAD, deps);

    assert.deepEqual(out, { status: "handled", conversationId: "conv-em" });
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0], {
      channel: "email",
      fromHandle: "jane@example.com",
      toHandle: "hello@acme.com",
      text: "Do you have any openings Friday?",
      contactId: "contact-3",
      metadata: { subject: "Booking question" },
    });
  });

  test("unparseable payload → {status:'ignored'}, runChannelTurn NOT called", async () => {
    let ran = false;
    const out = await handleInboundEmail(
      { type: "email.delivered", data: {} },
      {
        resolveOrgId: async () => "org-x",
        findContactByEmail: async () => null,
        runChannelTurn: async () => {
          ran = true;
          return { handled: true, conversationId: "x" };
        },
      },
    );
    assert.deepEqual(out, { status: "ignored", reason: "unparseable" });
    assert.equal(ran, false);
  });

  test("unknown to-address → {status:'ignored'}, runChannelTurn NOT called", async () => {
    let ran = false;
    const out = await handleInboundEmail(INBOUND_PAYLOAD, {
      resolveOrgId: async () => null, // no workspace owns this address
      findContactByEmail: async () => null,
      runChannelTurn: async () => {
        ran = true;
        return { handled: true, conversationId: "x" };
      },
    });
    assert.deepEqual(out, { status: "ignored", reason: "no_org" });
    assert.equal(ran, false);
  });

  test("unknown sender (no contact) still runs — contactId null", async () => {
    let captured: InboundMessage | null = null;
    const out = await handleInboundEmail(INBOUND_PAYLOAD, {
      resolveOrgId: async () => "org-acme",
      findContactByEmail: async () => null,
      runChannelTurn: async (inbound) => {
        captured = inbound;
        return { handled: false, reason: "no_agent" };
      },
    });
    assert.deepEqual(out, { status: "unhandled", reason: "no_agent" });
    assert.equal(captured!.contactId, null);
  });

  test("never throws — a contact-lookup failure degrades to ignored", async () => {
    const out = await handleInboundEmail(INBOUND_PAYLOAD, {
      resolveOrgId: async () => "org-acme",
      findContactByEmail: async () => {
        throw new Error("db down");
      },
      runChannelTurn: async () => ({ handled: true, conversationId: "x" }),
    });
    assert.equal(out.status, "ignored");
  });
});
