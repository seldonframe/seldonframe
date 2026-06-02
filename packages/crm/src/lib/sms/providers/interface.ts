export type SmsSendRequest = {
  orgId: string;
  from: string;
  to: string;
  body: string;
  statusCallback?: string;
  /**
   * SLICE 8: optional auth override. When set, the provider uses these
   * credentials INSTEAD of looking up the workspace's stored creds.
   * Resolver-driven test-mode dispatch sets this with test creds; live
   * mode dispatches leave it undefined and the provider self-resolves.
   */
  authOverride?: {
    accountSid: string;
    authToken: string;
  };
};

export type SmsSendResult = {
  externalMessageId: string;
  provider: string;
  segments: number;
};

export interface SmsProvider {
  readonly id: string;
  isConfigured(orgId: string): Promise<boolean>;
  send(request: SmsSendRequest): Promise<SmsSendResult>;
}

export class SmsProviderSendError extends Error {
  readonly retriable: boolean;
  readonly provider: string;
  readonly code: string | null;
  readonly details?: unknown;

  constructor(
    provider: string,
    message: string,
    options: { retriable?: boolean; code?: string | null; details?: unknown } = {}
  ) {
    super(message);
    this.name = "SmsProviderSendError";
    this.provider = provider;
    this.retriable = options.retriable ?? false;
    this.code = options.code ?? null;
    this.details = options.details;
  }
}

// E.164 is Twilio's wire format. Accept loose input + strip to a
// digits-plus-leading-plus canonical form. Callers should pre-validate
// that the number is routable before calling send().
export function toE164(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) {
    return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  }
  const digits = trimmed.replace(/\D/g, "");
  // Default to +1 for bare 10-digit numbers (North America). If the
  // builder's business is elsewhere, they paste the full +CC number.
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}
