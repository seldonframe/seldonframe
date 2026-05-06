// ============================================================================
// v1.18.0 — Resend Domains API (thin wrapper)
// ============================================================================
//
// Used by partner-agencies to register + verify their sender domain.
// Resend manages SPF/DKIM/DMARC DNS records via their API; we just
// surface the records to the agency, and poll Resend for verification.
//
// Agencies need:
//   - their own domain (e.g. acmeai.com)
//   - DNS access at their registrar to add SPF/DKIM records
//
// They do NOT need their own Resend account. Each agency's sender
// domain is registered UNDER our SeldonFrame Resend account (using
// our existing RESEND_API_KEY), with DNS pointing to records we
// surface. Once verified, we send emails FROM that domain on the
// agency's behalf.
//
// API surface (kept minimal — extend when v1.18.1+ adds polish):
//   - createResendSenderDomain(name) → { id, dnsRecords[] }
//   - getResendSenderDomain(id) → { status, dnsRecords[] }
//   - removeResendSenderDomain(id) → { ok }

const RESEND_API_BASE = "https://api.resend.com";

export interface ResendDnsRecord {
  /** "TXT" | "MX" | "CNAME" — the record type. */
  record: string;
  name: string;
  value: string;
  /** Whether Resend has detected the record at this hostname yet. */
  status?: string;
  ttl?: string;
  priority?: number;
}

export type CreateResendDomainResult =
  | {
      ok: true;
      domain_id: string;
      dns_records: ResendDnsRecord[];
      status: string;
    }
  | { ok: false; error: string; status: number };

export type GetResendDomainResult =
  | {
      ok: true;
      domain_id: string;
      name: string;
      status: string; // "pending" | "verified" | "failed"
      dns_records: ResendDnsRecord[];
    }
  | { ok: false; error: string; status: number };

export type RemoveResendDomainResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

interface ResendDomainsRecord {
  id?: string;
  name?: string;
  status?: string;
  records?: ResendDnsRecord[];
}

/**
 * Register a new sender domain with Resend. Returns the DNS records
 * the agency needs to add at their registrar. The records are
 * STABLE per-domain (Resend won't change them once issued), so the
 * agency can persist them once and add at any time.
 */
export async function createResendSenderDomain(
  domainName: string,
): Promise<CreateResendDomainResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "resend_not_configured", status: 503 };
  }

  let response: Response;
  try {
    response = await fetch(`${RESEND_API_BASE}/domains`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domainName }),
    });
  } catch (err) {
    return {
      ok: false,
      error: `resend_request_failed: ${err instanceof Error ? err.message : String(err)}`,
      status: 502,
    };
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    return { ok: false, error: detail, status: response.status };
  }

  const data = (await response.json().catch(() => ({}))) as ResendDomainsRecord;
  if (!data.id) {
    return {
      ok: false,
      error: "resend_response_missing_id",
      status: 502,
    };
  }

  return {
    ok: true,
    domain_id: data.id,
    dns_records: Array.isArray(data.records) ? data.records : [],
    status: data.status ?? "pending",
  };
}

/**
 * Get the current state of a Resend sender domain. Used to poll for
 * DNS-verification readiness.
 */
export async function getResendSenderDomain(
  domainId: string,
): Promise<GetResendDomainResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "resend_not_configured", status: 503 };
  }

  let response: Response;
  try {
    response = await fetch(`${RESEND_API_BASE}/domains/${encodeURIComponent(domainId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (err) {
    return {
      ok: false,
      error: `resend_request_failed: ${err instanceof Error ? err.message : String(err)}`,
      status: 502,
    };
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    return { ok: false, error: detail, status: response.status };
  }

  const data = (await response.json().catch(() => ({}))) as ResendDomainsRecord;
  if (!data.id) {
    return {
      ok: false,
      error: "resend_response_missing_id",
      status: 502,
    };
  }
  return {
    ok: true,
    domain_id: data.id,
    name: data.name ?? "",
    status: data.status ?? "pending",
    dns_records: Array.isArray(data.records) ? data.records : [],
  };
}

/**
 * Trigger Resend's verification check for a domain. Resend pulls DNS
 * fresh and updates the domain's status. The agency calls this after
 * they've added the DNS records.
 */
export async function triggerResendDomainVerification(
  domainId: string,
): Promise<GetResendDomainResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "resend_not_configured", status: 503 };
  }

  let response: Response;
  try {
    response = await fetch(
      `${RESEND_API_BASE}/domains/${encodeURIComponent(domainId)}/verify`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: `resend_request_failed: ${err instanceof Error ? err.message : String(err)}`,
      status: 502,
    };
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    return { ok: false, error: detail, status: response.status };
  }

  // The verify endpoint returns the same shape as GET /domains/:id.
  const data = (await response.json().catch(() => ({}))) as ResendDomainsRecord;
  return {
    ok: true,
    domain_id: data.id ?? domainId,
    name: data.name ?? "",
    status: data.status ?? "pending",
    dns_records: Array.isArray(data.records) ? data.records : [],
  };
}

export async function removeResendSenderDomain(
  domainId: string,
): Promise<RemoveResendDomainResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "resend_not_configured", status: 503 };
  }

  let response: Response;
  try {
    response = await fetch(
      `${RESEND_API_BASE}/domains/${encodeURIComponent(domainId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: `resend_request_failed: ${err instanceof Error ? err.message : String(err)}`,
      status: 502,
    };
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    return { ok: false, error: detail, status: response.status };
  }
  return { ok: true };
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { message?: string; error?: string };
    return data.message ?? data.error ?? "(no detail)";
  } catch {
    try {
      return await response.text();
    } catch {
      return "(no detail)";
    }
  }
}
