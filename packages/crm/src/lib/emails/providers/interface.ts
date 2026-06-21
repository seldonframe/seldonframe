/**
 * 2026-06-21 — A file attached to an outbound email. Shape mirrors the
 * Resend API: `content` is base64-encoded bytes. Used for the RFC-5545
 * calendar invite (`.ics`) emitted on booking.created. Additive — callers
 * that don't set `attachments` are unaffected.
 */
export type EmailAttachment = {
  filename: string;
  /** Base64-encoded file content. */
  content: string;
  /** MIME type, e.g. "text/calendar; method=REQUEST". */
  contentType?: string;
};

export type EmailSendRequest = {
  orgId: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
  /**
   * SLICE 8: optional API key override. When set, the provider uses
   * this key INSTEAD of looking up the workspace's stored creds.
   * Resolver-driven test-mode dispatch sets this with a re_test_ key;
   * live mode dispatches leave it undefined and the provider self-resolves.
   */
  apiKeyOverride?: string;
  /**
   * 2026-06-21 — optional attachments (e.g. an .ics calendar invite).
   * Undefined or empty → existing behavior byte-for-byte (no attachments
   * key on the wire request).
   */
  attachments?: EmailAttachment[];
  /**
   * 2026-06-21 — injectable fetch for unit tests. Defaults to the global
   * fetch in production. Mirrors the DI pattern in lib/notifications/
   * ops-notifications.ts so attachment forwarding can be asserted without
   * reaching the network.
   */
  fetcher?: typeof fetch;
};

export type EmailSendResult = {
  externalMessageId: string;
  provider: string;
};

export type EmailSendFailure = {
  reason: string;
  retriable: boolean;
};

export interface EmailProvider {
  readonly id: string;
  isConfigured(orgId: string): Promise<boolean>;
  send(request: EmailSendRequest): Promise<EmailSendResult>;
}

export class EmailProviderSendError extends Error {
  readonly retriable: boolean;
  readonly provider: string;
  readonly details?: unknown;

  constructor(provider: string, message: string, options: { retriable?: boolean; details?: unknown } = {}) {
    super(message);
    this.name = "EmailProviderSendError";
    this.provider = provider;
    this.retriable = options.retriable ?? false;
    this.details = options.details;
  }
}
