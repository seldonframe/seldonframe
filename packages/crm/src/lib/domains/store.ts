// ============================================================================
// v1.8.0 — workspace_domains store + state machine
// ============================================================================
//
// Composes the Vercel Domains API wrapper with the workspace_domains
// table. Operations:
//
//   addCustomDomain(workspaceId, hostname)
//     - Validate hostname shape
//     - Insert pending row
//     - Call Vercel addDomain
//     - On success: persist verification record, return DNS instructions
//     - On Vercel error: mark row failed + return error
//
//   verifyCustomDomain(workspaceId, hostname)
//     - Look up the row, must belong to the workspace
//     - Call Vercel getDomainConfig
//     - If misconfigured=false: mark verified + record verifiedAt
//     - Else: surface the recommended DNS record so the operator can fix
//
//   listWorkspaceDomains(workspaceId)
//     - SELECT all non-removed rows for the workspace
//
//   removeCustomDomain(workspaceId, hostname)
//     - Mark row removed in our DB
//     - Call Vercel removeDomain (idempotent)
//
// Workspace ownership is the only credential — every operation is
// scoped by workspace_id. Tier gating happens at the MCP/API layer.

import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  workspaceDomains,
  type DomainVerificationRecord,
  type WorkspaceDomainStatus,
} from "@/db/schema";
import {
  isValidHostname,
  isVercelConfigured,
  vercelAddDomain,
  vercelGetDomainConfig,
  vercelRemoveDomain,
} from "@/lib/integrations/vercel-domains";

export interface DomainRow {
  id: string;
  workspace_id: string;
  hostname: string;
  status: WorkspaceDomainStatus;
  verification_record: DomainVerificationRecord;
  verified_at: string | null;
  failed_reason: string | null;
  is_primary: boolean;
  vercel_domain_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDomain(row: typeof workspaceDomains.$inferSelect): DomainRow {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    hostname: row.hostname,
    status: row.status,
    verification_record: row.verificationRecord,
    verified_at: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    failed_reason: row.failedReason,
    is_primary: row.isPrimary,
    vercel_domain_id: row.vercelDomainId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export type AddDomainResult =
  | {
      ok: true;
      domain: DomainRow;
      dns_instructions: {
        kind: "cname" | "a";
        record: string;
        value: string;
        notes: string;
      };
    }
  | {
      ok: false;
      error:
        | "invalid_hostname"
        | "vercel_not_configured"
        | "hostname_taken"
        | "vercel_error";
      detail?: string;
    };

export async function addCustomDomain(args: {
  workspaceId: string;
  hostname: string;
}): Promise<AddDomainResult> {
  const hostname = args.hostname.trim().toLowerCase().replace(/^https?:\/\//, "");
  if (!isValidHostname(hostname)) {
    return { ok: false, error: "invalid_hostname" };
  }

  if (!isVercelConfigured()) {
    return { ok: false, error: "vercel_not_configured" };
  }

  // v1.8 — uniqueness against active rows. The unique index enforces
  // this at the DB level, but we pre-check here for a cleaner error
  // message than the Postgres unique-violation surfacing.
  const [conflict] = await db
    .select({ id: workspaceDomains.id, workspaceId: workspaceDomains.workspaceId })
    .from(workspaceDomains)
    .where(
      and(
        eq(workspaceDomains.hostname, hostname),
        ne(workspaceDomains.status, "removed"),
      ),
    )
    .limit(1);
  if (conflict) {
    return {
      ok: false,
      error: "hostname_taken",
      detail:
        conflict.workspaceId === args.workspaceId
          ? "This hostname is already registered to your workspace."
          : "This hostname is already registered to another workspace. Contact the current owner or pick a different hostname.",
    };
  }

  // Register with Vercel.
  const vercelResult = await vercelAddDomain({ hostname });
  if (!vercelResult.ok) {
    return {
      ok: false,
      error: "vercel_error",
      detail: `${vercelResult.error}${vercelResult.detail ? `: ${vercelResult.detail}` : ""}`,
    };
  }

  // Choose the verification record we'll surface. Vercel returns
  // optional verification[] for txt-based ownership proof; for normal
  // CNAME setup we use the cname.vercel-dns.com guidance from the
  // /config endpoint. Fall through with whatever Vercel gave us so
  // dashboard renders SOMETHING informative.
  const verification: DomainVerificationRecord = vercelResult.data.verification?.[0]
    ? {
        type: vercelResult.data.verification[0].type,
        name: vercelResult.data.verification[0].domain,
        value: vercelResult.data.verification[0].value,
        reason: vercelResult.data.verification[0].reason,
      }
    : {};

  // Persist.
  const [created] = await db
    .insert(workspaceDomains)
    .values({
      workspaceId: args.workspaceId,
      hostname,
      status: "pending",
      verificationRecord: verification,
      isPrimary: false,
    })
    .returning();

  // DNS instructions to render in the dashboard / MCP response.
  // Default: CNAME apex pointing to cname.vercel-dns.com.
  const isApex = hostname.split(".").length === 2;
  const dnsInstructions = isApex
    ? {
        kind: "a" as const,
        record: hostname,
        value: "76.76.21.21",
        notes:
          "Apex domains (no www / no subdomain prefix) need an A record pointing to Vercel's IP. After saving the record, run verify_domain to check propagation.",
      }
    : {
        kind: "cname" as const,
        record: hostname,
        value: "cname.vercel-dns.com",
        notes:
          "Add a CNAME record at your DNS registrar (Cloudflare, Namecheap, GoDaddy, Squarespace, etc.) pointing this hostname at cname.vercel-dns.com. After saving, run verify_domain. Most registrars apply CNAMEs within 5 minutes; some take up to 24 hours.",
      };

  return {
    ok: true,
    domain: rowToDomain(created),
    dns_instructions: dnsInstructions,
  };
}

export type VerifyDomainResult =
  | { ok: true; domain: DomainRow; verified: true }
  | {
      ok: true;
      domain: DomainRow;
      verified: false;
      misconfigured_reason: string;
      recommended_records: { type: "CNAME" | "A"; values: string[] };
    }
  | {
      ok: false;
      error: "not_found" | "vercel_not_configured" | "vercel_error";
      detail?: string;
    };

export async function verifyCustomDomain(args: {
  workspaceId: string;
  hostname: string;
}): Promise<VerifyDomainResult> {
  const hostname = args.hostname.trim().toLowerCase();

  const [row] = await db
    .select()
    .from(workspaceDomains)
    .where(
      and(
        eq(workspaceDomains.workspaceId, args.workspaceId),
        eq(workspaceDomains.hostname, hostname),
        ne(workspaceDomains.status, "removed"),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, error: "not_found" };

  if (!isVercelConfigured()) {
    return { ok: false, error: "vercel_not_configured" };
  }

  const config = await vercelGetDomainConfig({ hostname });
  if (!config.ok) {
    return {
      ok: false,
      error: "vercel_error",
      detail: `${config.error}${config.detail ? `: ${config.detail}` : ""}`,
    };
  }

  if (!config.data.misconfigured) {
    // Verified — mark row + return success.
    const [updated] = await db
      .update(workspaceDomains)
      .set({
        status: "verified",
        verifiedAt: new Date(),
        failedReason: null,
        updatedAt: new Date(),
      })
      .where(eq(workspaceDomains.id, row.id))
      .returning();
    return { ok: true, domain: rowToDomain(updated), verified: true };
  }

  // Still misconfigured — surface the recommended DNS records.
  const recommendedCNAME = config.data.recommendedCNAME ?? [];
  const recommendedIPv4 = config.data.recommendedIPv4 ?? [];
  const useCNAME = recommendedCNAME.length > 0;
  return {
    ok: true,
    domain: rowToDomain(row),
    verified: false,
    misconfigured_reason:
      "DNS doesn't resolve to Vercel yet. Either the CNAME / A record isn't set, or it hasn't propagated.",
    recommended_records: useCNAME
      ? { type: "CNAME", values: recommendedCNAME }
      : { type: "A", values: recommendedIPv4 },
  };
}

export async function listCustomDomainsForWorkspace(
  workspaceId: string,
): Promise<DomainRow[]> {
  const rows = await db
    .select()
    .from(workspaceDomains)
    .where(
      and(
        eq(workspaceDomains.workspaceId, workspaceId),
        ne(workspaceDomains.status, "removed"),
      ),
    );
  return rows.map(rowToDomain);
}

export type RemoveDomainResult =
  | { ok: true; removed: true }
  | { ok: false; error: "not_found" | "vercel_error"; detail?: string };

export async function removeCustomDomain(args: {
  workspaceId: string;
  hostname: string;
}): Promise<RemoveDomainResult> {
  const hostname = args.hostname.trim().toLowerCase();

  const [row] = await db
    .select()
    .from(workspaceDomains)
    .where(
      and(
        eq(workspaceDomains.workspaceId, args.workspaceId),
        eq(workspaceDomains.hostname, hostname),
        ne(workspaceDomains.status, "removed"),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, error: "not_found" };

  // Mark removed in our DB FIRST so subsequent traffic stops routing
  // here even if the Vercel call fails / is slow. Vercel's stale
  // record will get cleaned up by the next removeCustomDomain call
  // OR the manual cleanup script.
  await db
    .update(workspaceDomains)
    .set({ status: "removed", updatedAt: new Date() })
    .where(eq(workspaceDomains.id, row.id));

  // Best-effort Vercel cleanup. If Vercel's down or returns an error,
  // we've already updated our DB so traffic is no longer routed —
  // the failure is operational, not user-facing.
  if (isVercelConfigured()) {
    const result = await vercelRemoveDomain({ hostname });
    if (!result.ok) {
      console.warn(
        `[domains/store] Vercel domain removal failed for ${hostname}: ${result.error}${result.detail ? `: ${result.detail}` : ""}. Row already marked removed in our DB.`,
      );
    }
  }

  return { ok: true, removed: true };
}

/**
 * Hot-path lookup used by proxy.ts. Returns the workspace_id for a
 * given hostname, or null if the hostname isn't a verified custom
 * domain. Only verified rows route traffic — pending/failed/removed
 * fall through to the subdomain extraction path.
 */
export async function resolveWorkspaceForCustomDomain(
  hostname: string,
): Promise<{ workspace_id: string } | null> {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return null;
  const [row] = await db
    .select({ workspaceId: workspaceDomains.workspaceId })
    .from(workspaceDomains)
    .where(
      and(
        eq(workspaceDomains.hostname, normalized),
        eq(workspaceDomains.status, "verified"),
      ),
    )
    .limit(1);
  return row ? { workspace_id: row.workspaceId } : null;
}
