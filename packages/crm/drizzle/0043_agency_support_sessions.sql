-- v1.22.0 — agency support sessions audit table.
--
-- When an agency operator (e.g. Acme AI's user) "opens" their
-- HVAC client's branded operator portal at /portal/<slug>, we mint
-- a short-lived OperatorTokenPayload with supportOriginUserId set
-- to the agency operator's user_id. The payload's session cookie
-- carries that field so /portal/<slug>/(operator)/layout.tsx can
-- render the yellow "Agency support session active" banner.
--
-- We ALSO write a row to this audit table at session start (and a
-- best-effort ended_at on signout). Compliance + abuse detection:
-- a malicious agency operator who repeatedly impersonates their
-- HVAC client surfaces here.
--
-- v1.22 ships the schema + the start-of-session insert. v1.23 will
-- add a /agency/<id>/audit page rendering recent rows.

CREATE TABLE IF NOT EXISTS "agency_support_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agency_id" uuid NOT NULL REFERENCES "partner_agencies"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "origin_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "ended_at" timestamptz,
  "ip_hash" text,
  "user_agent" text,
  "notes" text
);

-- Hot-path index: audit dashboard "recent sessions for agency X".
CREATE INDEX IF NOT EXISTS "agency_support_sessions_agency_started_idx"
  ON "agency_support_sessions" ("agency_id", "started_at" DESC);

-- Hot-path index: workspace-side audit ("who from agency Y has
-- opened my workspace recently?").
CREATE INDEX IF NOT EXISTS "agency_support_sessions_workspace_started_idx"
  ON "agency_support_sessions" ("workspace_id", "started_at" DESC);

-- Per-user history (for abuse detection: rate-limit, anomaly).
CREATE INDEX IF NOT EXISTS "agency_support_sessions_origin_user_idx"
  ON "agency_support_sessions" ("origin_user_id", "started_at" DESC);
