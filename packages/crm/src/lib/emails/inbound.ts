// Multi-surface runtime — inbound-email helpers (net-new).
//
// The inbound-email webhook (app/api/webhooks/email/inbound/route.ts) parses a
// Resend Inbound payload into a normalized message and resolves which workspace
// the "to" address belongs to, then hands it to the channel-adapter seam
// (runChannelTurn). These helpers are PURE / DI'd so the parse + resolution
// logic is unit-tested without a provider or DB (the repo tests thin webhook
// routes at this layer, not the handler directly).
//
// to→org resolution uses what actually exists in the schema:
//   1. a VERIFIED custom domain on workspace_domains (hostname='acme.com',
//      status='verified') → that workspace, OR
//   2. the <slug>@inbound.<root> convention → organizations.slug.
// No invented columns.
//
// Plain module (not "use server") — imported by a route handler.

import type { InboundMessage } from "@/lib/agents/channels/channel-adapter";

// ─── parse ───────────────────────────────────────────────────────────────────

/** A normalized inbound email — the shape runChannelTurn consumes. */
export type ParsedInboundEmail = {
  from: string;
  to: string;
  subject: string;
  text: string;
};

/** Strip HTML to a rough plain-text fallback when the provider gives no text
 *  part. Deliberately simple (collapse tags + whitespace) — good enough to feed
 *  the agent; we never render it. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize a Resend Inbound webhook payload into ParsedInboundEmail, or null if
 * it isn't a usable inbound message. Expected shape:
 *   { type: "email.received", data: { from, to, subject, text?, html?, ... } }
 * `to` may be a string or string[] (we take the first). Returns null for any
 * non-"email.received" type, missing from/to, or an empty body.
 */
export function parseInboundEmail(payload: unknown): ParsedInboundEmail | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as { type?: unknown; data?: unknown };
  if (root.type !== "email.received") return null;
  if (!root.data || typeof root.data !== "object") return null;

  const data = root.data as {
    from?: unknown;
    to?: unknown;
    subject?: unknown;
    text?: unknown;
    html?: unknown;
  };

  // Unwrap "Display Name <a@b.com>" → "a@b.com" (lowercased) so the reply
  // target + the contact lookup get a clean address.
  const from = typeof data.from === "string" ? unwrapAddress(data.from) : "";
  const toRaw = Array.isArray(data.to) ? data.to[0] : data.to;
  const to = typeof toRaw === "string" ? unwrapAddress(toRaw) : "";
  if (!from || !to) return null;

  const subject = typeof data.subject === "string" ? data.subject.trim() : "";

  let text = typeof data.text === "string" ? data.text.trim() : "";
  if (!text && typeof data.html === "string") {
    text = htmlToText(data.html);
  }
  if (!text) return null;

  return { from, to, subject, text };
}

// ─── address helpers ───────────────────────────────────────────────────────

/** Extract the address from a possible "Display Name <a@b.com>" wrapper. */
function unwrapAddress(input: string): string {
  const trimmed = input.trim();
  const angled = trimmed.match(/<([^>]+)>/);
  return (angled ? angled[1] : trimmed).trim().toLowerCase();
}

/** The domain part of an email address (lowercased), or null. */
export function extractEmailDomain(address: unknown): string | null {
  if (typeof address !== "string" || !address) return null;
  const addr = unwrapAddress(address);
  const at = addr.lastIndexOf("@");
  if (at <= 0 || at === addr.length - 1) return null;
  const domain = addr.slice(at + 1);
  return domain.includes(".") ? domain : null;
}

/** The local part of an email address (lowercased), or null. */
export function extractLocalPart(address: unknown): string | null {
  if (typeof address !== "string" || !address) return null;
  const addr = unwrapAddress(address);
  const at = addr.lastIndexOf("@");
  if (at <= 0) return null;
  const local = addr.slice(0, at);
  return local || null;
}

// ─── resolveOrgByInboundAddress ─────────────────────────────────────────────

export type ResolveInboundAddressDeps = {
  /** orgId of the workspace owning this VERIFIED custom domain, or null. */
  findOrgIdByVerifiedDomain: (domain: string) => Promise<string | null>;
  /** orgId of the workspace with this slug, or null. */
  findOrgIdBySlug: (slug: string) => Promise<string | null>;
  /** The root the <slug>@inbound.<root> convention uses (e.g.
   *  "inbound.seldonframe.com"). */
  inboundRootDomain: string;
};

function buildDefaultResolveDeps(): ResolveInboundAddressDeps {
  return {
    findOrgIdByVerifiedDomain: async (domain) => {
      const { db } = await import("@/db");
      const { workspaceDomains } = await import("@/db/schema");
      const { and, eq } = await import("drizzle-orm");
      const [row] = await db
        .select({ workspaceId: workspaceDomains.workspaceId })
        .from(workspaceDomains)
        .where(
          and(
            eq(workspaceDomains.hostname, domain),
            eq(workspaceDomains.status, "verified"),
          ),
        )
        .limit(1);
      return row?.workspaceId ?? null;
    },
    findOrgIdBySlug: async (slug) => {
      const { db } = await import("@/db");
      const { organizations } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1);
      return row?.id ?? null;
    },
    inboundRootDomain:
      process.env.SELDONFRAME_INBOUND_EMAIL_DOMAIN?.trim() || "inbound.seldonframe.com",
  };
}

/**
 * Resolve an inbound "to" address to an orgId. Custom verified domain wins;
 * otherwise, if the address is on the inbound root domain, resolve by slug.
 * Returns null (no lookups) for a malformed address, and soft-fails to null on
 * any thrown error.
 */
export async function resolveOrgByInboundAddress(
  toAddress: string,
  deps: ResolveInboundAddressDeps = buildDefaultResolveDeps(),
): Promise<string | null> {
  const domain = extractEmailDomain(toAddress);
  if (!domain) return null;

  try {
    // 1. Verified custom domain → workspace.
    const byDomain = await deps.findOrgIdByVerifiedDomain(domain);
    if (byDomain) return byDomain;

    // 2. <slug>@inbound.<root> → workspace by slug. Only attempt when the
    //    address is actually on the inbound root (don't slug-probe gmail.com).
    const root = deps.inboundRootDomain.trim().toLowerCase();
    if (root && domain === root) {
      const slug = extractLocalPart(toAddress);
      if (slug) {
        const bySlug = await deps.findOrgIdBySlug(slug);
        if (bySlug) return bySlug;
      }
    }

    return null;
  } catch (err) {
    console.error(
      `[inbound-email] resolve_org_failed to=${toAddress} err=${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

// ─── contact lookup ────────────────────────────────────────────────────────

/** Find a contact in an org by email (case-insensitive). Returns the id or
 *  null. Lazy DB import so unit tests that don't need it never touch Neon. */
export async function findContactByEmail(
  orgId: string,
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const { db } = await import("@/db");
  const { contacts } = await import("@/db/schema");
  const { and, eq, sql } = await import("drizzle-orm");
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), sql`lower(${contacts.email}) = ${normalized}`))
    .limit(1);
  return row?.id ?? null;
}

// ─── handleInboundEmail (route orchestrator) ────────────────────────────────

/** The runChannelTurn result shape (matches run-channel-turn.ts). */
type RunChannelTurnResult =
  | { handled: true; conversationId: string }
  | { handled: false; reason: string };

export type HandleInboundEmailDeps = {
  /** to-address → orgId (custom domain / slug). */
  resolveOrgId: (toAddress: string) => Promise<string | null>;
  /** sender email → contactId in that org (or null). */
  findContactByEmail: (orgId: string, email: string) => Promise<string | null>;
  /** The channel-adapter seam (runChannelTurn pre-bound with the email adapter). */
  runChannelTurn: (inbound: InboundMessage) => Promise<RunChannelTurnResult>;
};

export type HandleInboundEmailOutcome =
  | { status: "handled"; conversationId: string }
  | { status: "unhandled"; reason: string }
  | { status: "ignored"; reason: string };

/**
 * Orchestrate one inbound-email webhook delivery: parse → resolve org → look up
 * the sender contact → runChannelTurn (which runs the agent loop + sends the
 * reply via the email adapter). NEVER throws — every failure path returns an
 * "ignored" outcome so the route can always 200 (no provider retry-storm). An
 * unparseable payload or an unknown to-address is ignored WITHOUT running the
 * agent loop.
 */
export async function handleInboundEmail(
  payload: unknown,
  deps: HandleInboundEmailDeps,
): Promise<HandleInboundEmailOutcome> {
  try {
    const parsed = parseInboundEmail(payload);
    if (!parsed) return { status: "ignored", reason: "unparseable" };

    const orgId = await deps.resolveOrgId(parsed.to);
    if (!orgId) return { status: "ignored", reason: "no_org" };

    const contactId = await deps.findContactByEmail(orgId, parsed.from);

    const res = await deps.runChannelTurn({
      channel: "email",
      fromHandle: parsed.from,
      toHandle: parsed.to,
      text: parsed.text,
      contactId: contactId ?? null,
      metadata: { subject: parsed.subject },
    });

    if (res.handled) return { status: "handled", conversationId: res.conversationId };
    return { status: "unhandled", reason: res.reason };
  } catch (err) {
    console.error(
      `[inbound-email] handle_failed err=${err instanceof Error ? err.message : String(err)}`,
    );
    return { status: "ignored", reason: "error" };
  }
}
