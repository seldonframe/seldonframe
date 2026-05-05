-- v1.7.0 — magic-link device-flow auth.
--
-- Issued when an operator wants to administer a workspace from a NEW
-- device/IDE without having the original workspace bearer locally.
-- Lifecycle:
--
--   1. Operator: connect_workspace(email, workspace_slug, device_label)
--   2. Server: insert row { atok, workspace_id, email, device_label,
--                           status='pending', expires_at=now()+5min }
--      AND email the operator a link: /auth?atok=<atok>
--   3. Operator clicks email link → browser approval page renders
--      (workspace name + device label + Yes/No buttons).
--   4. Operator clicks Yes → POST /api/v1/auth/approve with atok →
--      server mints a fresh workspace bearer token, stamps
--      issued_token_id, sets status='approved'.
--   5. Meanwhile, MCP server has been polling GET /api/v1/auth/check
--      with the atok. On approval the poll resolves and returns the
--      raw bearer token (one shot — never stored unhashed elsewhere).
--   6. MCP stores the bearer in the device's local config; subsequent
--      tool calls authenticate as the workspace.
--
-- Row TTL: 5 minutes from creation (status='pending'). Approved rows
-- live forever for audit (which device authorized when, against which
-- workspace). Rejected rows mark status='rejected'.
--
-- Email is stored on the row so the approval page can display "this
-- request was sent to <email>" — useful when the operator clicks an
-- old/stale email and wants to know whether to bother approving.

CREATE TABLE IF NOT EXISTS "device_auth_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "atok" text NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "device_label" text NOT NULL,
  -- 'pending' | 'approved' | 'rejected' | 'expired'
  "status" text NOT NULL DEFAULT 'pending',
  "expires_at" timestamptz NOT NULL,
  "approved_at" timestamptz,
  -- FK to api_keys.id (workspace bearer storage). NULL until approval.
  -- Unhashed token returned ONCE to the polling MCP; only the hash
  -- is persisted in api_keys. issued_token_id is just the bookkeeping
  -- pointer for "which bearer was minted from this approval".
  "issued_token_id" uuid,
  -- Raw bearer token, encrypted. ONE-SHOT field — cleared as soon as
  -- the polling MCP claims it via /api/v1/auth/check. Empty string
  -- after claim. Encryption avoids leaking tokens in DB snapshots.
  "issued_token_raw" text NOT NULL DEFAULT '',
  "claimed_at" timestamptz,
  "ip" text,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- atok is the only lookup key — must be unique + indexed.
CREATE UNIQUE INDEX IF NOT EXISTS "device_auth_requests_atok_uniq"
  ON "device_auth_requests" ("atok");

-- Index for cleanup cron (eventually): find expired pending rows.
CREATE INDEX IF NOT EXISTS "device_auth_requests_status_expires_idx"
  ON "device_auth_requests" ("status", "expires_at");

-- Index for audit: list approvals per workspace.
CREATE INDEX IF NOT EXISTS "device_auth_requests_workspace_idx"
  ON "device_auth_requests" ("workspace_id", "created_at" DESC);
