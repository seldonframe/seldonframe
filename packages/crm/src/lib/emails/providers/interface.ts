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
