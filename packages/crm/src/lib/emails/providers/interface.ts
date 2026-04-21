export type EmailSendRequest = {
  orgId: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
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
