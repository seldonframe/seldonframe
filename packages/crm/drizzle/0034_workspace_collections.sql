-- May 2, 2026 — Composable Primitives foundation.
--
-- Five tables that turn SeldonFrame from a fixed-blocks product into
-- a platform: operators (via Claude Code MCP) can create dynamic
-- "collections" (tables), populate them with "records," surface them
-- through "pages" (admin / public / portal), pin "sidebar items" to
-- the admin nav, and wire "agents" that react to record / form /
-- booking / deal / schedule events.
--
-- Architecture choice — JSONB-on-generic-table over per-collection
-- ALTER TABLE. Operators don't get raw Postgres tables; they get a
-- dynamic schema layer where every collection's row data lives in
-- workspace_records.data (jsonb) and the schema is described by
-- workspace_collections.schema (jsonb array of field definitions).
-- This trades query specificity for shipping speed — gin index on
-- data covers most field-filter queries, and we can promote a
-- collection to a real table later if any single one outgrows the
-- generic layer.
--
-- All tables are workspace-scoped via organization_id with cascade
-- delete so dropping a workspace cleans up everything cleanly.

-- ─── workspace_collections ────────────────────────────────────────────
-- Dynamic "tables" defined per workspace. Slug is unique per org so
-- each workspace can have its own "courses", "invoices", etc.
CREATE TABLE IF NOT EXISTS "workspace_collections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "slug" varchar(100) NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "icon" varchar(50) NOT NULL DEFAULT 'file-text',
  -- Field definitions: [{ key, label, type, required?, options?, reference?, default_value?, placeholder? }]
  "schema" jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Per-collection settings: { default_sort, default_sort_direction, default_view, kanban_field, enable_portal_access }
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_collections_org_slug_unique" UNIQUE ("organization_id", "slug")
);

CREATE INDEX IF NOT EXISTS "idx_workspace_collections_org"
  ON "workspace_collections" ("organization_id");

COMMENT ON TABLE "workspace_collections" IS
  'Composable Primitives — dynamic table definitions per workspace. Each row defines a "collection" (e.g. courses, invoices, reviews) whose row data lives in workspace_records.data with the shape from .schema.';

-- ─── workspace_records ────────────────────────────────────────────────
-- Rows in a dynamic collection. data is jsonb shaped per the parent
-- collection's schema. contact_id optional — set for collections like
-- enrollments / invoices that anchor to a CRM contact.
CREATE TABLE IF NOT EXISTS "workspace_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "collection_id" uuid NOT NULL REFERENCES "workspace_collections"("id") ON DELETE CASCADE,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
  "status" varchar(100),
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_workspace_records_collection_created"
  ON "workspace_records" ("collection_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_workspace_records_org_collection"
  ON "workspace_records" ("organization_id", "collection_id");

CREATE INDEX IF NOT EXISTS "idx_workspace_records_contact"
  ON "workspace_records" ("contact_id")
  WHERE "contact_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_workspace_records_status"
  ON "workspace_records" ("collection_id", "status");

-- gin index on the jsonb data column lets us filter by any field
-- without an explicit per-field index. e.g. data @> '{"status": "Published"}'
CREATE INDEX IF NOT EXISTS "idx_workspace_records_data"
  ON "workspace_records" USING gin ("data");

COMMENT ON TABLE "workspace_records" IS
  'Composable Primitives — rows in a dynamic collection. data is jsonb shaped per parent collection.schema. Portal pages scope by contact_id = session.contact.id.';

-- ─── workspace_pages ──────────────────────────────────────────────────
-- Custom pages built by operators. page_type drives the dynamic
-- renderer (list / detail / form / static / kanban / portal).
-- visibility scopes who can see them: public (subdomain),
-- admin (dashboard catch-all), portal (logged-in client portal).
CREATE TABLE IF NOT EXISTS "workspace_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "slug" varchar(100) NOT NULL,
  "title" varchar(255) NOT NULL,
  "page_type" varchar(50) NOT NULL,
  "visibility" varchar(20) NOT NULL DEFAULT 'admin',
  "collection_id" uuid REFERENCES "workspace_collections"("id") ON DELETE SET NULL,
  "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "style_overrides" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "rendered_html" text,
  "rendered_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_pages_org_slug_unique" UNIQUE ("organization_id", "slug")
);

CREATE INDEX IF NOT EXISTS "idx_workspace_pages_org"
  ON "workspace_pages" ("organization_id");

CREATE INDEX IF NOT EXISTS "idx_workspace_pages_visibility"
  ON "workspace_pages" ("organization_id", "visibility");

COMMENT ON TABLE "workspace_pages" IS
  'Composable Primitives — operator-defined pages. page_type ∈ {list, detail, form, static, kanban, portal}. visibility ∈ {public, admin, portal}. collection_id optional (static pages render content.body without a data source).';

-- ─── workspace_sidebar_items ──────────────────────────────────────────
-- Custom nav items in the admin dashboard sidebar. group_name buckets
-- them under a header (default "YOUR BLOCKS"). sort_order orders
-- within group; lower comes first.
CREATE TABLE IF NOT EXISTS "workspace_sidebar_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "label" varchar(100) NOT NULL,
  "icon" varchar(50) NOT NULL DEFAULT 'file-text',
  "href" varchar(255) NOT NULL,
  "group_name" varchar(50) NOT NULL DEFAULT 'YOUR BLOCKS',
  "sort_order" integer NOT NULL DEFAULT 100,
  "visible" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_sidebar_items_org_href_unique" UNIQUE ("organization_id", "href")
);

CREATE INDEX IF NOT EXISTS "idx_workspace_sidebar_items_org_order"
  ON "workspace_sidebar_items" ("organization_id", "sort_order");

COMMENT ON TABLE "workspace_sidebar_items" IS
  'Composable Primitives — operator-defined sidebar nav items. Rendered alongside built-in items in components/layout/sidebar.tsx, bucketed by group_name (default "YOUR BLOCKS").';

-- ─── workspace_agents ─────────────────────────────────────────────────
-- Operator-defined automation agents. trigger.type fires the agent;
-- steps array is interpreted by the dispatcher. status ∈
-- {draft, active, paused}. Dispatcher only watches active rows.
CREATE TABLE IF NOT EXISTS "workspace_agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "icon" varchar(50) NOT NULL DEFAULT 'bot',
  -- Trigger config: { type: "record.created" | "record.updated" | "form.submitted" | "schedule" | ..., collection?, field?, value?, form?, cron?, stage? }
  "trigger" jsonb NOT NULL,
  -- Step array: [{ type, ...step-specific fields }]. Step types:
  -- wait, send_email, send_sms, create_record, update_record,
  -- create_contact, update_contact, create_deal, notify_operator,
  -- llm_call, approval_gate, condition, webhook
  "steps" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  -- Per-agent settings: { requires_approval, max_runs_per_day, llm_model, enabled }
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_workspace_agents_org_status"
  ON "workspace_agents" ("organization_id", "status");

COMMENT ON TABLE "workspace_agents" IS
  'Composable Primitives — operator-defined automation agents. trigger config + steps array interpreted by the dispatcher. status="active" rows are live; "paused"/"draft" are inert.';
