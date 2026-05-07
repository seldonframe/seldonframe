-- v1.26.0 — agent foundation (web chat archetype + safety-first runtime)
--
-- Five tables: agents (the blueprint), agent_versions (rollback +
-- eval-gated promotion), agent_conversations (per-customer chat
-- session), agent_turns (every user/assistant/tool message with
-- validators + cost), agent_evals (test scenarios per version).
--
-- Safety-first design: every turn writes a row, validators_passed
-- jsonb captures which output validators ran (quotes_only_from_soul_pricing,
-- no_prompt_injection_echo, etc.) and which passed/failed. tool_calls +
-- tool_results jsonb captures every typed tool the LLM called +
-- response. Replayable, auditable, debuggable.
--
-- Per-workspace daily_token_budget gates runaway cost. tokens_used_today
-- resets daily via cron (or lazy on first turn after midnight).

CREATE TABLE IF NOT EXISTS "agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "channel" text NOT NULL CHECK ("channel" IN ('web_chat', 'voice', 'sms', 'email')),
  "archetype" text NOT NULL,
  "blueprint" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "current_version" int NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'test', 'live', 'paused')),
  "daily_token_budget" int NOT NULL DEFAULT 50000,
  "tokens_used_today" int NOT NULL DEFAULT 0,
  "tokens_used_reset_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agents_org_status_idx" ON "agents" ("org_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "agents_org_slug_uniq" ON "agents" ("org_id", lower("slug"));

CREATE TABLE IF NOT EXISTS "agent_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "version" int NOT NULL,
  "blueprint" jsonb NOT NULL,
  "published_at" timestamptz NOT NULL DEFAULT now(),
  "published_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "publish_notes" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_versions_agent_version_uniq"
  ON "agent_versions" ("agent_id", "version");

CREATE TABLE IF NOT EXISTS "agent_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "agent_version" int NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
  -- Anonymous session id: visitor hasn't given email yet but we
  -- thread their messages within this browser session.
  "anonymous_session_id" text,
  "channel_meta" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active', 'completed', 'escalated', 'abandoned', 'test')),
  -- Operator-marked quality signal. NULL = unmarked. Feeds Brain
  -- via a weekly cron once accumulated.
  "operator_quality" text CHECK ("operator_quality" IN ('good', 'bad', NULL)),
  "operator_notes" text,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "last_turn_at" timestamptz NOT NULL DEFAULT now(),
  "ended_at" timestamptz,
  "llm_cost_cents" int NOT NULL DEFAULT 0,
  "tokens_in" int NOT NULL DEFAULT 0,
  "tokens_out" int NOT NULL DEFAULT 0,
  "turn_count" int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "agent_conversations_agent_started_idx"
  ON "agent_conversations" ("agent_id", "started_at" DESC);
CREATE INDEX IF NOT EXISTS "agent_conversations_org_started_idx"
  ON "agent_conversations" ("org_id", "started_at" DESC);
CREATE INDEX IF NOT EXISTS "agent_conversations_anon_session_idx"
  ON "agent_conversations" ("anonymous_session_id")
  WHERE "anonymous_session_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "agent_turns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "agent_conversations"("id") ON DELETE CASCADE,
  "turn_index" int NOT NULL,
  "role" text NOT NULL CHECK ("role" IN ('user', 'assistant', 'tool', 'system')),
  "content" text,
  "tool_calls" jsonb,
  "tool_results" jsonb,
  -- Each entry: { name: string, passed: boolean, details?: string }
  "validators_passed" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "latency_ms" int,
  "tokens_in" int,
  "tokens_out" int,
  "model" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_turns_conv_index_uniq"
  ON "agent_turns" ("conversation_id", "turn_index");
CREATE INDEX IF NOT EXISTS "agent_turns_conv_created_idx"
  ON "agent_turns" ("conversation_id", "created_at" ASC);

CREATE TABLE IF NOT EXISTS "agent_evals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "agent_version" int NOT NULL,
  "scenario_id" text NOT NULL,
  "scenario" jsonb NOT NULL,
  "expected" jsonb NOT NULL,
  "actual" jsonb,
  "passed" boolean,
  "error" text,
  "ran_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agent_evals_agent_version_idx"
  ON "agent_evals" ("agent_id", "agent_version", "ran_at" DESC);
