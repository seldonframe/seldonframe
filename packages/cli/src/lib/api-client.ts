// api-client — the typed client for the SeldonFrame builder marketplace API.
//
// Mirrors the LIVE endpoints shipped in packages/crm (app/api/v1/build/*):
//   POST /api/v1/build/discover         { query, limit }      → { results[], count }
//   POST /api/v1/build/inspect          { type, id }          → InspectView
//   POST /api/v1/build/run              { type, id, input }   → RunResult
//   GET  /api/v1/build/wallet/balance                         → { balance, earnings }
//
// Auth is the workspace bearer (`Authorization: Bearer wst_…`). `fetch` is
// INJECTED (defaults to the global) so the request-building + error-mapping is
// unit-tested against a fake fetch with zero network. This client only CALLS the
// existing read/run endpoints — it opens NO new charge path (the run endpoint is
// money-safe by construction; the CLI just relays its `billing` block honestly).

export type Money = { value: number; currency: string };

export type CatalogPrice = {
  type: "per_call" | "per_result" | "per_outcome";
  amountCents: number;
  outcomeType?: string;
  baseCents?: number;
};

export type DiscoverResult = {
  id: string;
  type: "agent" | "tool";
  provider?: string;
  name: string;
  description: string;
  price: CatalogPrice;
  score: number;
};

export type DiscoverResponse = { results: DiscoverResult[]; count: number };

export type InspectView = {
  id: string;
  type: "agent" | "tool";
  name: string;
  description: string;
  inputSchema: { type: string; properties?: Record<string, unknown>; required?: string[]; [k: string]: unknown };
  price: CatalogPrice;
  provider?: string;
  capabilities?: string[];
  docUrl?: string;
};

export type RunBilling = {
  calculatedCost: number;
  amountCents: number;
  feeCents: number;
  netCents: number;
  charged: boolean;
  recorded: boolean;
  balanceMicros?: number;
};

export type RunResult = {
  runId: string;
  status: "completed" | "error" | "insufficient_balance" | string;
  output?: unknown;
  providerResponse?: unknown;
  error?: string;
  price: CatalogPrice;
  billing: RunBilling;
};

export type WalletBalance = { balance: Money; earnings: Money };

export type PayoutResult =
  | { status: "paid"; amountUsd: number; transferId: string }
  | { status: "connect_required"; onboardingUrl: string | null }
  | { status: "below_min"; withdrawableUsd: number; minUsd: number }
  | { status: "disabled" };

export type WorkspaceState = {
  ok: boolean;
  workspace?: { name?: string };
  builder?: {
    next_action?: string;
    progress?: { done: number; total: number };
    earnings?: { accrued_usd: number; payout_status: string | { available_usd: number } };
    agents?: { name: string; slug: string; stage: string; live: boolean }[];
    wallet_balance_usd?: number;
    fund_hint?: string | null;
  };
};

/** A minimal fetch signature — exactly what we use — so a fake is trivial. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export type ApiClientOptions = {
  /** API base, no trailing slash, e.g. https://app.seldonframe.com */
  baseUrl: string;
  /** The active wst_ workspace bearer. Null/empty ⇒ requests will 401 honestly. */
  apiKey: string | null;
  fetchImpl?: FetchLike;
};

/** A typed error carrying the HTTP status so the CLI maps it to a friendly hint. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Thrown when no active key is configured — never even hits the network. */
export class NoKeyError extends Error {
  constructor() {
    super("No active key configured.");
    this.name = "NoKeyError";
  }
}

/** Thrown when the request never reached the server (DNS/connect/TLS failure). */
export class NetworkError extends Error {
  constructor(baseUrl: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Could not reach ${baseUrl} (${detail}).`);
    this.name = "NetworkError";
  }
}

const DEFAULT_BASE_URL = "https://app.seldonframe.com";

/** Trim a trailing slash so we can safely concatenate the path. */
export function normalizeBaseUrl(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  const base = s.length > 0 ? s : DEFAULT_BASE_URL;
  return base.replace(/\/+$/, "");
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly fetchImpl: FetchLike;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = normalizeBaseUrl(opts.baseUrl);
    this.apiKey = opts.apiKey && opts.apiKey.trim().length > 0 ? opts.apiKey.trim() : null;
    // Default to the platform fetch (Node 18+). Cast through unknown: the global
    // fetch's Response is a superset of our FetchLike result shape.
    this.fetchImpl =
      opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  /** True when a key is present (the network-bound commands require this). */
  hasKey(): boolean {
    return this.apiKey !== null;
  }

  async discover(query: string, limit?: number): Promise<DiscoverResponse> {
    const body: Record<string, unknown> = { query };
    if (typeof limit === "number" && Number.isFinite(limit)) body.limit = limit;
    return this.request<DiscoverResponse>("POST", "/api/v1/build/discover", body);
  }

  async inspect(type: "agent" | "tool", id: string): Promise<InspectView> {
    return this.request<InspectView>("POST", "/api/v1/build/inspect", { type, id });
  }

  async run(
    type: "agent" | "tool",
    id: string,
    input: Record<string, unknown>,
  ): Promise<RunResult> {
    // The run endpoint returns 402 (insufficient_balance) as a real HTTP error;
    // request() maps that to an ApiError the CLI turns into the top-up hint.
    return this.request<RunResult>("POST", "/api/v1/build/run", { type, id, input });
  }

  async walletBalance(): Promise<WalletBalance> {
    return this.request<WalletBalance>("GET", "/api/v1/build/wallet/balance");
  }

  async workspaceState(): Promise<WorkspaceState> {
    return this.request<WorkspaceState>("GET", "/api/v1/workspace-state");
  }

  async walletTopup(amountUsd: number): Promise<{ ok: boolean; checkoutUrl?: string; reason?: string }> {
    return this.request<{ ok: boolean; checkoutUrl?: string; reason?: string }>(
      "POST", "/api/v1/build/wallet/topup", { amountUsd },
    );
  }

  async payout(): Promise<PayoutResult> {
    return this.request<PayoutResult>("POST", "/api/v1/build/payout");
  }

  /** The single request path: auth header + JSON body + honest error mapping. */
  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.apiKey) throw new NoKeyError();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (cause) {
      // The request never reached the server (offline, bad base URL, TLS, …).
      throw new NetworkError(this.baseUrl, cause);
    }

    const payload = await res.json().catch(() => undefined);

    if (!res.ok) {
      const msg =
        (payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error: unknown }).error)
          : "") || `Request failed with status ${res.status}.`;
      throw new ApiError(res.status, msg, payload);
    }

    return payload as T;
  }
}
