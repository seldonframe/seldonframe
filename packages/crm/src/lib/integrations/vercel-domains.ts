// ============================================================================
// v1.8.0 — Vercel Domains API wrapper
// ============================================================================
//
// Thin client around the four Vercel endpoints we need:
//
//   POST /v9/projects/<projectId>/domains
//     Register a custom hostname under our project. Vercel adds it to
//     the deployment config. Subsequent traffic to that hostname (with
//     correct DNS) routes here.
//
//   GET /v9/projects/<projectId>/domains/<domain>/config
//     Returns DNS configuration status — whether the CNAME (or A
//     record for apex) resolves correctly. We poll this to update
//     workspace_domains.status from pending → verified.
//
//   GET /v9/projects/<projectId>/domains/<domain>
//     Returns the domain record incl. verification field that tells
//     us what DNS record the operator needs to add.
//
//   DELETE /v9/projects/<projectId>/domains/<domain>
//     Removes the domain. We call this when an operator removes a
//     custom domain.
//
// Auth: VERCEL_TOKEN env var. The token needs project-level write
// access ("integration token" scope). When missing, all functions
// return { ok: false, error: "vercel_not_configured" } so the MCP
// tool can surface a clean operator-facing error.
//
// All API calls return a discriminated result type — caller checks
// `ok` and routes on the rest. No exceptions thrown.

const VERCEL_API_BASE = "https://api.vercel.com";

export type VercelResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      status?: number;
      detail?: string;
    };

interface VercelEnv {
  token: string;
  projectId: string;
  teamId?: string;
}

/**
 * Resolve env. Returns null when missing required pieces — caller
 * surfaces "vercel_not_configured" to the operator. Set
 * VERCEL_TOKEN + VERCEL_PROJECT_ID on the deployment to enable.
 * VERCEL_TEAM_ID is optional (only needed when the project lives in
 * a Vercel team rather than the personal account).
 */
function resolveVercelEnv(): VercelEnv | null {
  const token = process.env.VERCEL_TOKEN?.trim() ?? "";
  const projectId = process.env.VERCEL_PROJECT_ID?.trim() ?? "";
  const teamId = process.env.VERCEL_TEAM_ID?.trim() ?? "";
  if (!token || !projectId) return null;
  return { token, projectId, teamId: teamId || undefined };
}

/** Validate a hostname client-side before round-tripping to Vercel.
 *  Cheap pre-check so we return clean errors for obviously-bad input.
 *  Vercel will still re-validate on its side. */
export function isValidHostname(hostname: string): boolean {
  if (!hostname || hostname.length > 253) return false;
  // Strip any accidental scheme/path the operator may have included.
  if (/^https?:\/\//i.test(hostname)) return false;
  if (hostname.includes("/") || hostname.includes(":")) return false;
  // Standard hostname character set (lowercased) — letters/digits/hyphens
  // separated by dots, with at least one dot.
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(hostname);
}

/**
 * Register a hostname under our Vercel project. Vercel returns the
 * domain record incl. verification field. We persist the verification
 * record so the dashboard + MCP can render DNS instructions.
 */
export async function vercelAddDomain(args: {
  hostname: string;
}): Promise<
  VercelResult<{
    name: string;
    verification?: Array<{ type: string; domain: string; value: string; reason: string }>;
    verified?: boolean;
    /** Vercel's id for this domain registration. */
    apexName?: string;
  }>
> {
  const env = resolveVercelEnv();
  if (!env) return { ok: false, error: "vercel_not_configured" };

  const url = new URL(
    `${VERCEL_API_BASE}/v10/projects/${encodeURIComponent(env.projectId)}/domains`,
  );
  if (env.teamId) url.searchParams.set("teamId", env.teamId);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: args.hostname }),
    });
  } catch (err) {
    return {
      ok: false,
      error: "network_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = {};
  }

  if (!res.ok) {
    const detail = (body as { error?: { message?: string; code?: string } })?.error;
    return {
      ok: false,
      error: detail?.code ?? `vercel_${res.status}`,
      status: res.status,
      detail: detail?.message ?? JSON.stringify(body).slice(0, 400),
    };
  }

  return { ok: true, data: body as never };
}

/**
 * Check whether the hostname's DNS resolves correctly + Vercel has
 * issued SSL. The /config endpoint returns the misconfigured field —
 * if false, we mark the domain verified.
 */
export async function vercelGetDomainConfig(args: {
  hostname: string;
}): Promise<
  VercelResult<{
    misconfigured: boolean;
    /** When misconfigured, the recommended DNS record to add. */
    recommendedCNAME?: string[];
    /** Apex domains may need A records instead of CNAME. */
    recommendedIPv4?: string[];
  }>
> {
  const env = resolveVercelEnv();
  if (!env) return { ok: false, error: "vercel_not_configured" };

  const url = new URL(
    `${VERCEL_API_BASE}/v6/domains/${encodeURIComponent(args.hostname)}/config`,
  );
  if (env.teamId) url.searchParams.set("teamId", env.teamId);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${env.token}` },
    });
  } catch (err) {
    return {
      ok: false,
      error: "network_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  let body: {
    misconfigured?: boolean;
    recommendedCNAME?: string[];
    recommendedIPv4?: string[];
  };
  try {
    body = (await res.json()) as never;
  } catch {
    body = {};
  }

  if (!res.ok) {
    return {
      ok: false,
      error: `vercel_${res.status}`,
      status: res.status,
      detail: JSON.stringify(body).slice(0, 400),
    };
  }

  return {
    ok: true,
    data: {
      misconfigured: Boolean(body.misconfigured),
      recommendedCNAME: body.recommendedCNAME,
      recommendedIPv4: body.recommendedIPv4,
    },
  };
}

/**
 * Remove a hostname from our Vercel project. Idempotent — Vercel
 * returns 404 if it's already gone, which we treat as success.
 */
export async function vercelRemoveDomain(args: {
  hostname: string;
}): Promise<VercelResult<{ removed: true }>> {
  const env = resolveVercelEnv();
  if (!env) return { ok: false, error: "vercel_not_configured" };

  const url = new URL(
    `${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(env.projectId)}/domains/${encodeURIComponent(args.hostname)}`,
  );
  if (env.teamId) url.searchParams.set("teamId", env.teamId);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.token}` },
    });
  } catch (err) {
    return {
      ok: false,
      error: "network_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!res.ok && res.status !== 404) {
    let body: unknown = {};
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    return {
      ok: false,
      error: `vercel_${res.status}`,
      status: res.status,
      detail: JSON.stringify(body).slice(0, 400),
    };
  }

  return { ok: true, data: { removed: true } };
}

export function isVercelConfigured(): boolean {
  return resolveVercelEnv() !== null;
}
