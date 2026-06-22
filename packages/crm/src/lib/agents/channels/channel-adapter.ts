// Multi-surface runtime — the channel-adapter seam.
//
// ONE seam lets inbound SMS + inbound email (and, later, social DMs) all flow
// through the SAME agent loop (executeTurn) via run-channel-turn.ts. A
// ChannelAdapter knows only how to SEND a reply on its transport; the inbound
// PARSE happens in each route (it already has the provider payload in hand) and
// is normalized into an InboundMessage before runChannelTurn is called.
//
// Reply-sending stays the adapter's job (not executeTurn's): executeTurn returns
// text only, and each transport has its own audited send path
// (sendSmsFromApi / sendEmailFromApi) that preserves suppression + the
// /conversations audit log. Keeping that here means the orchestrator never
// imports a transport.
//
// This module is a PLAIN module (not "use server") — sendSmsFromApi /
// sendEmailFromApi are the non-server-action API wrappers built exactly for
// route-handler + tool-binding callers, so the adapters can call them directly.

import type { sendSmsFromApi } from "@/lib/sms/api";
import type { sendEmailFromApi } from "@/lib/emails/api";

// ─── shared shapes ─────────────────────────────────────────────────────────

/** A transport-normalized inbound message. `fromHandle`/`toHandle` are E.164
 *  phone numbers for SMS and email addresses for email — the orchestrator
 *  treats them opaquely, so one code path serves every surface. */
export type InboundMessage = {
  channel: "sms" | "email";
  /** Who SENT it (the customer). The reply goes back here. */
  fromHandle: string;
  /** Who it was sent TO (our provisioned number / inbound address). Resolves
   *  the target agent. */
  toHandle: string;
  /** The plain-text body the agent reasons over. */
  text: string;
  /** The CRM contact this sender maps to, if known (looked up by the route). */
  contactId?: string | null;
  /** Optional provider metadata (subject line, raw payload, …) for the route to
   *  thread through; not interpreted by the orchestrator. */
  metadata?: Record<string, unknown>;
};

/** The reply target the orchestrator hands the adapter: send `text` FROM the
 *  resolved workspace (orgId — so the right Twilio number / Resend domain is
 *  used) back TO the customer (fromHandle on the inbound = toHandle here). */
export type ChannelReplyTarget = {
  /** The customer's handle (we reply to them). */
  fromHandle: string;
  /** Our handle the message came in on (for logging / subject threading). */
  toHandle: string;
  /** The workspace the resolved agent belongs to. For a deployment number this
   *  is the CLIENT org, so the reply is sent from the client workspace. */
  orgId: string;
  /** The CRM contact, when known — threaded into the audit log. */
  contactId?: string | null;
  /** Optional metadata (e.g. the original subject for an email Re: line). */
  metadata?: Record<string, unknown>;
};

/** A transport that can send the agent's reply. Parsing inbound is the route's
 *  job (it holds the provider payload); the adapter is send-only. */
export type ChannelAdapter = {
  sendReply(target: ChannelReplyTarget, text: string): Promise<void>;
};

// ─── Twilio SMS adapter ────────────────────────────────────────────────────

/** Inject the send fn so the adapter is unit-testable without Twilio / Neon. */
export type TwilioSmsAdapterDeps = { sendSms: typeof sendSmsFromApi };

function defaultSmsDeps(): TwilioSmsAdapterDeps {
  return {
    sendSms: async (params) => {
      const { sendSmsFromApi } = await import("@/lib/sms/api");
      return sendSmsFromApi(params);
    },
  };
}

/**
 * Build a ChannelAdapter that replies over SMS. The reply goes back to the
 * sender (target.fromHandle) from the resolved workspace's Twilio number, via
 * the SAME sendSmsFromApi the live SMS path uses — so suppression checks, the
 * audit log, and webhook dispatch all still apply. userId is null (no
 * interactive operator); contactId is threaded when known.
 */
export function createTwilioSmsAdapter(
  deps: TwilioSmsAdapterDeps = defaultSmsDeps(),
): ChannelAdapter {
  return {
    sendReply: async (target, text) => {
      await deps.sendSms({
        orgId: target.orgId,
        userId: null,
        contactId: target.contactId ?? null,
        toNumber: target.fromHandle,
        body: text,
      });
    },
  };
}

// ─── Resend email adapter ──────────────────────────────────────────────────

export type ResendEmailAdapterDeps = { sendEmail: typeof sendEmailFromApi };

function defaultEmailDeps(): ResendEmailAdapterDeps {
  return {
    sendEmail: async (params) => {
      const { sendEmailFromApi } = await import("@/lib/emails/api");
      return sendEmailFromApi(params);
    },
  };
}

/** Derive a "Re: …" subject from the inbound subject (threaded in metadata),
 *  avoiding a double "Re:" prefix. Falls back to a generic subject. Exported so
 *  the email route + tests share one rule. */
export function deriveReplySubject(inboundSubject: unknown): string {
  const raw = typeof inboundSubject === "string" ? inboundSubject.trim() : "";
  if (!raw) return "Re: your message";
  return /^re:/i.test(raw) ? raw : `Re: ${raw}`;
}

/**
 * Build a ChannelAdapter that replies over email via sendEmailFromApi (full
 * suppression + branding + audit treatment). Replies to the sender
 * (target.fromHandle) from the resolved workspace; the subject becomes
 * "Re: <original>" when the route passes the inbound subject in metadata.
 */
export function createResendEmailAdapter(
  deps: ResendEmailAdapterDeps = defaultEmailDeps(),
): ChannelAdapter {
  return {
    sendReply: async (target, text) => {
      const subject = deriveReplySubject(target.metadata?.subject);
      await deps.sendEmail({
        orgId: target.orgId,
        userId: null,
        contactId: target.contactId ?? null,
        toEmail: target.fromHandle,
        subject,
        body: text,
      });
    },
  };
}
