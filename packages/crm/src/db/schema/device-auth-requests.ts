// ============================================================================
// v1.7.0 — device_auth_requests: magic-link device-flow auth
// ============================================================================
//
// Issued when an operator runs `connect_workspace` in a fresh IDE/device.
// One row per request: atok = single-use random string in the magic link;
// status walks pending → approved (or rejected/expired); issued_token_raw
// holds the freshly-minted workspace bearer until the polling MCP claims
// it (then cleared).

import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export type DeviceAuthStatus = "pending" | "approved" | "rejected" | "expired";

export const deviceAuthRequests = pgTable(
  "device_auth_requests",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    /** Random URL-safe token — appears in the magic-link URL + the MCP
     *  poll request. Single-use: lookup by atok, status=pending checks
     *  guard against replay. */
    atok: text("atok").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Email address the magic link was sent to. Stored for the approval
     *  page's "this was sent to ___" display. */
    email: text("email").notNull(),
    /** Human-readable label shown on the approval page so the operator
     *  can verify they're authorizing the right device. e.g.
     *  "Claude Code on MacBook Pro (xyz)" or "Cursor on Windows-Desktop". */
    deviceLabel: text("device_label").notNull(),
    status: text("status").notNull().$type<DeviceAuthStatus>().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** Pointer to the api_keys row holding the hashed bearer. NULL
     *  until approval. */
    issuedTokenId: uuid("issued_token_id"),
    /** Raw bearer token — one-shot. Cleared the moment the polling MCP
     *  claims it via /api/v1/auth/check. Empty string after claim. */
    issuedTokenRaw: text("issued_token_raw").notNull().default(""),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    /** Capture for audit. Filled at initiate-time from the originating
     *  MCP request. */
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("device_auth_requests_atok_uniq").on(table.atok),
    index("device_auth_requests_status_expires_idx").on(
      table.status,
      table.expiresAt,
    ),
    index("device_auth_requests_workspace_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);
