// v1.26.0 — agent foundation tables. See drizzle/0044_agents.sql for
// table-level docs. Five tables: agents (blueprint), agent_versions
// (rollback + eval-gated promotion), agent_conversations (per-customer
// session), agent_turns (every message + validators + cost),
// agent_evals (test scenarios per version).

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";
import { users } from "./users";

// ─── agents ──────────────────────────────────────────────────────────────

export type AgentBlueprint = {
  /** What persona this agent has (industry-derived from soul). */
  archetype?: string;
  /** Capabilities the agent has access to (subset of the typed
   *  tool allowlist). v1.26 ships: look_up_availability,
   *  book_appointment, find_my_existing_appointment, escalate_to_human,
   *  provide_faq_answer. */
  capabilities?: string[];
  /** Inline FAQ knowledge (operator-provided Q&A pairs). */
  faq?: Array<{ q: string; a: string }>;
  /** Greeting shown when the chat first opens. */
  greeting?: string;
  /** Allowed pricing facts the agent can quote. Generated from
   *  soul.pricing; validators check responses against this list. */
  pricingFacts?: Array<{ label: string; amount: number; currency: string }>;
  /** Tone overrides (otherwise inherits soul.voice). */
  toneOverrides?: { warmth?: number; formality?: number };
};

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** 'web_chat' | 'voice' | 'sms' | 'email' (v1.26 ships web_chat only). */
    channel: text("channel").notNull(),
    /** Archetype id (e.g. 'website-chatbot'). Maps to a SKILL.md. */
    archetype: text("archetype").notNull(),
    blueprint: jsonb("blueprint").$type<AgentBlueprint>().notNull().default(sql`'{}'::jsonb`),
    currentVersion: integer("current_version").notNull().default(1),
    /** 'draft' | 'test' | 'live' | 'paused'. Eval suite gates the
     *  draft→live and test→live transitions. */
    status: text("status").notNull().default("draft"),
    dailyTokenBudget: integer("daily_token_budget").notNull().default(50000),
    tokensUsedToday: integer("tokens_used_today").notNull().default(0),
    tokensUsedResetAt: timestamp("tokens_used_reset_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agents_org_status_idx").on(table.orgId, table.status),
    uniqueIndex("agents_org_slug_uniq").on(table.orgId, sql`lower(${table.slug})`),
  ],
);

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

// ─── agent_versions ──────────────────────────────────────────────────────

export const agentVersions = pgTable(
  "agent_versions",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    blueprint: jsonb("blueprint").$type<AgentBlueprint>().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedByUserId: uuid("published_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    publishNotes: text("publish_notes"),
  },
  (table) => [
    uniqueIndex("agent_versions_agent_version_uniq").on(
      table.agentId,
      table.version,
    ),
  ],
);

export type AgentVersion = typeof agentVersions.$inferSelect;

// ─── agent_conversations ─────────────────────────────────────────────────

export const agentConversations = pgTable(
  "agent_conversations",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    agentVersion: integer("agent_version").notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    anonymousSessionId: text("anonymous_session_id"),
    channelMeta: jsonb("channel_meta")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** 'active' | 'completed' | 'escalated' | 'abandoned' | 'test'. */
    status: text("status").notNull().default("active"),
    /** Operator-marked quality after review: 'good' | 'bad' | null. */
    operatorQuality: text("operator_quality"),
    operatorNotes: text("operator_notes"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastTurnAt: timestamp("last_turn_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    llmCostCents: integer("llm_cost_cents").notNull().default(0),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    turnCount: integer("turn_count").notNull().default(0),
  },
  (table) => [
    index("agent_conversations_agent_started_idx").on(
      table.agentId,
      table.startedAt,
    ),
    index("agent_conversations_org_started_idx").on(
      table.orgId,
      table.startedAt,
    ),
    index("agent_conversations_anon_session_idx")
      .on(table.anonymousSessionId)
      .where(sql`${table.anonymousSessionId} IS NOT NULL`),
  ],
);

export type AgentConversation = typeof agentConversations.$inferSelect;

// ─── agent_turns ─────────────────────────────────────────────────────────

export type AgentToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type AgentToolResult = {
  toolCallId: string;
  ok: boolean;
  output?: unknown;
  error?: string;
};

export type AgentValidatorResult = {
  name: string;
  passed: boolean;
  details?: string;
};

export const agentTurns = pgTable(
  "agent_turns",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => agentConversations.id, { onDelete: "cascade" }),
    turnIndex: integer("turn_index").notNull(),
    /** 'user' | 'assistant' | 'tool' | 'system'. */
    role: text("role").notNull(),
    content: text("content"),
    toolCalls: jsonb("tool_calls").$type<AgentToolCall[]>(),
    toolResults: jsonb("tool_results").$type<AgentToolResult[]>(),
    validatorsPassed: jsonb("validators_passed")
      .$type<AgentValidatorResult[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    latencyMs: integer("latency_ms"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("agent_turns_conv_index_uniq").on(
      table.conversationId,
      table.turnIndex,
    ),
    index("agent_turns_conv_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export type AgentTurn = typeof agentTurns.$inferSelect;

// ─── agent_evals ─────────────────────────────────────────────────────────

export type AgentEvalScenario = {
  /** Stable identifier within the SKILL.md so eval history is comparable. */
  id: string;
  /** Human-readable description ("user asks for after-hours emergency"). */
  description: string;
  /** Sequence of user messages to send. */
  userMessages: string[];
  /** Channel-meta override for synthetic test sessions. */
  channelMeta?: Record<string, unknown>;
};

export type AgentEvalExpectation = {
  /** Substrings that MUST appear in the final assistant response. */
  responseContains?: string[];
  /** Substrings that MUST NOT appear (e.g., specific dollar amounts
   *  not in soul.pricing). */
  responseLacks?: string[];
  /** Tool calls the agent must make (in any order). */
  toolCallsRequired?: Array<{ name: string }>;
  /** Validators that must all pass. */
  validatorsAllPassed?: boolean;
  /** Conversation ends with this status. */
  endStatus?: "active" | "completed" | "escalated" | "abandoned";
};

export const agentEvals = pgTable(
  "agent_evals",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    agentVersion: integer("agent_version").notNull(),
    scenarioId: text("scenario_id").notNull(),
    scenario: jsonb("scenario").$type<AgentEvalScenario>().notNull(),
    expected: jsonb("expected").$type<AgentEvalExpectation>().notNull(),
    actual: jsonb("actual").$type<Record<string, unknown> | null>(),
    passed: boolean("passed"),
    error: text("error"),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_evals_agent_version_idx").on(
      table.agentId,
      table.agentVersion,
      table.ranAt,
    ),
  ],
);

export type AgentEval = typeof agentEvals.$inferSelect;
