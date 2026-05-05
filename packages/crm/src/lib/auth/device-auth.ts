// ============================================================================
// v1.7.0 — magic-link device-flow auth helpers
// ============================================================================
//
// Three operations per request lifecycle:
//
//   initiateDeviceAuth({ workspaceSlug, email, deviceLabel, ip?, userAgent? })
//     → creates a fresh atok with status='pending', expires in 5min,
//       sends the magic-link email, returns the atok (the MCP server
//       polls this) + the approval URL (also embedded in the email).
//
//   approveDeviceAuth({ atok })
//     → marks the atok approved, mints a fresh workspace bearer with
//       7-day expiry (matches the standard admin-token TTL), stamps
//       issued_token_raw + issued_token_id. The approval URL fires this
//       when the operator clicks "Authorize" on the browser page.
//
//   checkDeviceAuth({ atok })
//     → the polling endpoint. Returns:
//         { status: "pending" } while waiting
//         { status: "approved", token } once approved (one-shot — clears
//                                                      issued_token_raw)
//         { status: "rejected" | "expired" } on terminal failure
//
// Crypto: atok is 32 random URL-safe bytes. The bearer issued on
// approval is minted via the existing mintWorkspaceToken (api_keys row
// with sha256 hash). The raw bearer is encrypted at rest in
// issued_token_raw (using the existing encryption.ts helper) so a DB
// snapshot leak doesn't compromise tokens.

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { deviceAuthRequests, organizations } from "@/db/schema";
import { mintWorkspaceToken } from "@/lib/auth/workspace-token";
import { decryptValue, encryptValue } from "@/lib/encryption";

const TTL_MINUTES = 5;
const TOKEN_TTL_DAYS = 7;
const ATOK_BYTES = 32;

function generateAtok(): string {
  return crypto.randomBytes(ATOK_BYTES).toString("base64url");
}

export type InitiateInput = {
  workspaceSlug: string;
  email: string;
  deviceLabel: string;
  ip?: string;
  userAgent?: string;
};

export type InitiateResult =
  | {
      ok: true;
      atok: string;
      approval_url: string;
      expires_at: string;
      workspace: { id: string; slug: string; name: string };
    }
  | {
      ok: false;
      error:
        | "workspace_not_found"
        | "invalid_email"
        | "invalid_device_label";
    };

export async function initiateDeviceAuth(input: InitiateInput): Promise<InitiateResult> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    return { ok: false, error: "invalid_email" };
  }
  if (!input.deviceLabel || input.deviceLabel.length > 80) {
    return { ok: false, error: "invalid_device_label" };
  }
  const slug = input.workspaceSlug.trim().toLowerCase();
  if (!slug) {
    return { ok: false, error: "workspace_not_found" };
  }

  const [workspace] = await db
    .select({ id: organizations.id, slug: organizations.slug, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!workspace) {
    return { ok: false, error: "workspace_not_found" };
  }

  const atok = generateAtok();
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

  await db.insert(deviceAuthRequests).values({
    atok,
    workspaceId: workspace.id,
    email: input.email,
    deviceLabel: input.deviceLabel.slice(0, 80),
    status: "pending",
    expiresAt,
    ip: input.ip ?? null,
    userAgent: input.userAgent?.slice(0, 200) ?? null,
  });

  const baseUrl = (
    process.env.NEXTAUTH_URL?.trim() || "https://app.seldonframe.com"
  ).replace(/\/+$/, "");
  const approvalUrl = `${baseUrl}/auth?atok=${encodeURIComponent(atok)}`;

  return {
    ok: true,
    atok,
    approval_url: approvalUrl,
    expires_at: expiresAt.toISOString(),
    workspace,
  };
}

export type ApproveInput = {
  atok: string;
};
export type ApproveResult =
  | { ok: true; workspace_id: string }
  | {
      ok: false;
      error: "not_found" | "already_handled" | "expired";
    };

export async function approveDeviceAuth(input: ApproveInput): Promise<ApproveResult> {
  const [row] = await db
    .select()
    .from(deviceAuthRequests)
    .where(eq(deviceAuthRequests.atok, input.atok))
    .limit(1);
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "pending") return { ok: false, error: "already_handled" };
  if (row.expiresAt.getTime() < Date.now()) {
    await db
      .update(deviceAuthRequests)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(deviceAuthRequests.id, row.id));
    return { ok: false, error: "expired" };
  }

  // Mint a fresh workspace bearer scoped to the workspace + 7-day TTL.
  const minted = await mintWorkspaceToken(row.workspaceId, {
    name: `Device: ${row.deviceLabel}`,
    expiresInDays: TOKEN_TTL_DAYS,
  });

  // Encrypt the raw token at rest. encryptValue returns "v1.<ciphertext>".
  const encrypted = encryptValue(minted.token);

  await db
    .update(deviceAuthRequests)
    .set({
      status: "approved",
      approvedAt: new Date(),
      issuedTokenId: minted.tokenId,
      issuedTokenRaw: encrypted,
      updatedAt: new Date(),
    })
    .where(eq(deviceAuthRequests.id, row.id));

  return { ok: true, workspace_id: row.workspaceId };
}

export type RejectInput = { atok: string };
export type RejectResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "already_handled" };

export async function rejectDeviceAuth(input: RejectInput): Promise<RejectResult> {
  const [row] = await db
    .select()
    .from(deviceAuthRequests)
    .where(eq(deviceAuthRequests.atok, input.atok))
    .limit(1);
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "pending") return { ok: false, error: "already_handled" };
  await db
    .update(deviceAuthRequests)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(deviceAuthRequests.id, row.id));
  return { ok: true };
}

export type CheckInput = { atok: string };
export type CheckResult =
  | { status: "pending" }
  | {
      status: "approved";
      token: string;
      workspace_id: string;
      expires_at: string | null;
    }
  | { status: "rejected" }
  | { status: "expired" }
  | { status: "not_found" }
  | { status: "already_claimed" };

/**
 * Poll endpoint. On approved status, returns the raw bearer token ONCE
 * and clears issued_token_raw so a replay can't extract the same token.
 * Concurrent polls race for the claim — only one wins.
 */
export async function checkDeviceAuth(input: CheckInput): Promise<CheckResult> {
  const [row] = await db
    .select()
    .from(deviceAuthRequests)
    .where(eq(deviceAuthRequests.atok, input.atok))
    .limit(1);
  if (!row) return { status: "not_found" };

  // Lazy expiry check.
  if (
    row.status === "pending" &&
    row.expiresAt.getTime() < Date.now()
  ) {
    await db
      .update(deviceAuthRequests)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(deviceAuthRequests.id, row.id));
    return { status: "expired" };
  }

  if (row.status === "pending") return { status: "pending" };
  if (row.status === "rejected") return { status: "rejected" };
  if (row.status === "expired") return { status: "expired" };

  // status === "approved"
  if (!row.issuedTokenRaw) {
    return { status: "already_claimed" };
  }

  // Atomic claim: clear raw + stamp claimed_at, only if still set.
  const result = await db
    .update(deviceAuthRequests)
    .set({
      issuedTokenRaw: "",
      claimedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(deviceAuthRequests.id, row.id),
        eq(deviceAuthRequests.issuedTokenRaw, row.issuedTokenRaw),
      ),
    )
    .returning({ id: deviceAuthRequests.id });
  if (result.length === 0) {
    // Lost the race — another poller already claimed.
    return { status: "already_claimed" };
  }

  let token: string;
  try {
    token = row.issuedTokenRaw.startsWith("v1.")
      ? decryptValue(row.issuedTokenRaw)
      : row.issuedTokenRaw;
  } catch {
    return { status: "already_claimed" };
  }

  return {
    status: "approved",
    token,
    workspace_id: row.workspaceId,
    expires_at: null, // expiresInDays:7 — caller can decode if needed
  };
}

/**
 * Lookup-only helper for the browser approval page. Returns the
 * pending-state metadata so the page can render workspace name + device
 * label without exposing the issued token (issuedTokenRaw stripped).
 */
export async function lookupDeviceAuthForApprovalPage(atok: string): Promise<
  | {
      ok: true;
      workspace: { id: string; slug: string; name: string };
      email: string;
      device_label: string;
      status: "pending" | "approved" | "rejected" | "expired" | "claimed";
      expires_at: string;
    }
  | { ok: false; error: "not_found" | "expired" }
> {
  const [row] = await db
    .select()
    .from(deviceAuthRequests)
    .where(eq(deviceAuthRequests.atok, atok))
    .limit(1);
  if (!row) return { ok: false, error: "not_found" };
  if (
    row.status === "pending" &&
    row.expiresAt.getTime() < Date.now()
  ) {
    await db
      .update(deviceAuthRequests)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(deviceAuthRequests.id, row.id));
    return { ok: false, error: "expired" };
  }
  const [workspace] = await db
    .select({ id: organizations.id, slug: organizations.slug, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, row.workspaceId))
    .limit(1);
  if (!workspace) return { ok: false, error: "not_found" };
  const status: "pending" | "approved" | "rejected" | "expired" | "claimed" =
    row.status === "approved" && !row.issuedTokenRaw
      ? "claimed"
      : (row.status as "pending" | "approved" | "rejected" | "expired");
  return {
    ok: true,
    workspace,
    email: row.email,
    device_label: row.deviceLabel,
    status,
    expires_at: row.expiresAt.toISOString(),
  };
}
