export * from "./organizations";
export * from "./org-members";
export * from "./users";
export * from "./auth";
export * from "./contacts";
export * from "./pipelines";
export * from "./deals";
export * from "./activities";
export * from "./bookings";
export * from "./emails";
export * from "./email-events";
export * from "./conversations";
export * from "./conversation-turns";
export * from "./suppression-list";
export * from "./sms-messages";
export * from "./sms-events";
export * from "./landing-pages";
export * from "./portal-access-codes";
export * from "./portal-messages";
export * from "./portal-resources";
export * from "./portal-documents";
export * from "./intake-forms";
export * from "./metrics-snapshots";
export * from "./webhooks";
export * from "./api-keys";
export * from "./payments";
export * from "./invoices";
export * from "./subscriptions";
export * from "./payment-events";
export * from "./marketplace";
export * from "./seldon-usage";
export * from "./seldon-sessions";
export * from "./form-submissions";
export * from "./memberships";
export * from "./soul-sources";
export * from "./seldon-patterns";
export * from "./preview-sessions";
export * from "./brain";
export * from "./workspace-secrets";
// Scope 3 Step 2c PR 1 — durable workflow runtime state.
export * from "./workflow-runs";
export * from "./workflow-waits";
export * from "./workflow-event-log";
// Scope 3 Step 2c PR 3 — step trace for observability.
export * from "./workflow-step-results";
// SLICE 1 PR 2 — block-level reactive subscriptions.
export * from "./block-subscription-registry";
export * from "./block-subscription-deliveries";
// SLICE 7 PR 1 — message triggers (inbound SMS pattern matching).
export * from "./message-triggers";
// SLICE 10 PR 1 C2 — request_approval persistence.
export * from "./workflow-approvals";
// May 1, 2026 — Measurement Layers 2 + 3.
export * from "./seldonframe-events";
export * from "./brain-outcomes";
// May 2, 2026 — Composable Primitives foundation. Five tables that
// turn SeldonFrame into a platform: dynamic data collections,
// records, pages (admin/public/portal), sidebar items, and custom
// automation agents. API routes + MCP tools + dynamic page renderer
// land in the spawned composable-primitives task.
export * from "./workspace-collections";
export * from "./workspace-records";
export * from "./workspace-pages";
export * from "./workspace-sidebar-items";
export * from "./workspace-agents";
// v1.3.0 — LLM-generated CRMPersonality cache (Karpathy: model
// generates, validator gates, cache scales).
export * from "./personality-cache";
// v1.4.0 — block_instances: per-workspace storage for v2 (MCP-native)
// blocks. The IDE agent generates props from a block's SKILL.md, posts
// them here, and the rendered HTML lands in the same row. Forever-frozen
// edits live in `customizations`.
export * from "./block-instances";
// v1.6.0 — brain_notes: file-tree storage for the Karpathy LLM-Wiki
// brain. Two layers (workspace + global), self-pruning + self-promoting
// via confidence/uses/wins. The compounding moat.
export * from "./brain-notes";
// v1.7.0 — device_auth_requests: magic-link device-flow auth so
// operators can administer existing workspaces from new IDEs/devices
// without copy-pasting bearer tokens.
export * from "./device-auth-requests";
// v1.8.0 — workspace_domains: custom hostnames for paying tiers,
// registered through Vercel Domains API.
export * from "./workspace-domains";
// v1.17.0 — partner_agencies: white-label CRM resellers (Layer 1
// in the SF/Agency/Workspace/Customer hierarchy). organizations
// gains a parent_agency_id FK (added in the 0040 migration).
export * from "./partner-agencies";

// v1.22.0 — agency_support_sessions: audit log when an agency
// operator opens their managed workspace's branded operator portal
// for support purposes. Tracks origin_user_id, started_at, ended_at.
export * from "./agency-support-sessions";

// v1.26.0 — agent foundation: agents (blueprint), agent_versions
// (rollback + eval-gated promotion), agent_conversations (chat
// session), agent_turns (every message + validators + cost),
// agent_evals (test scenarios per version). Web chat archetype
// ships first; voice / SMS / email queued.
export * from "./agents";

// 2026-05-18 — outbound messaging layer (plan v2):
// outbound_message_triggers + outbound_message_sends. Symmetric to
// the existing message_triggers (inbound SMS routing from SLICE 7),
// but for the outbound side: event fires → dispatch rule → compose
// + send via operator's Resend/Twilio. See db/schema/outbound-messages.ts.
export * from "./outbound-messages";

// 2026-05-18 — slice 6: outbound_scheduled_sends queue for time-
// delayed messages (booking reminders, intake followups). See
// db/schema/outbound-scheduled-sends.ts.
export * from "./outbound-scheduled-sends";

// 2026-05-19 — Proposal Builder.
export * from "./proposals";
export * from "./proposal-events";

// 2026-05-22 — Phase T: natural-language landing editor + undo history.
export * from "./landing-payload-versions";

// 2026-06-04 — Client-onboarding intake (Task 1): tokenized intake links +
// wiring-agent change plans.
export * from "./onboarding";

// 2026-06-15 — Operator Portal PWA v2: conversation notes (internal notes
// on SMS threads visible only to the operator team).
export * from "./conversation-notes";

// ICP-3 — builder-deploys-to-many-SMBs foundation: reusable agent templates,
// lite-tenant deployments (no-login client), and BYOK LLM keys per builder.
export * from "./agent-templates";
export * from "./deployments";
export * from "./builder-llm-keys";

// 2026-06-26 — Outbound-UX Bundle F2 (send delay): durable queue for
// time-deferred event-agent sends. When a matched event-agent's trigger carries
// delayMinutes > 0, runEventAgent enqueues the frozen event context here and the
// cron at /api/cron/event-agent-scheduled-sends replays it at due time. See
// db/schema/event-agent-scheduled-sends.ts.
export * from "./event-agent-scheduled-sends";

// 2026-06-23 — ACP (Agentic Commerce Protocol): ChatGPT Instant-Checkout
// session persistence. Additive table; money-safe (the wired processor is a
// no-charge dev stub — see lib/acp/processor.ts).
export * from "./acp";

// 2026-06-28 — Recurring & Metered Agent Billing (#139) P0: marketplace_purchases.
// Additive table; the fiat-Stripe-Connect settlement record for buying a
// marketplace agent on the SELLER's connected account (5% application fee).
// Money-safe — stripe_mode defaults 'test', a 'live' row needs the live flag +
// key + charges_enabled; inert without a Stripe key. See
// lib/marketplace/billing/*.
export * from "./marketplace-purchases";

// 2026-06-30 — Builder Marketplace (spec 1ff09dcb) P2: the PREPAID WALLET.
// Two additive tables — wallet_accounts (one balance per org+mode) +
// wallet_transactions (the append-only ledger with a UNIQUE idempotency_key).
// A Stripe top-up funds the balance; every successful build run draws it down by
// a LEDGER decrement (no Stripe call per run). Money-safe: never negative, no
// double-debit (UNIQUE idempotency_key), inert without a Stripe key. See
// lib/build/wallet-ledger.ts + lib/build/wallet-store.ts.
export * from "./wallet";

// 2026-07-02 — Improve verb + trust rail (migration 0060): eval_runs (durable
// eval-suite results, manual/improve/publish-gate) + agent_improve_proposals
// (propose-only blueprint patch + failure-cluster rationale, applied ONLY by
// applyImproveProposal). Additive. See db/schema/eval-runs.ts.
export * from "./eval-runs";
// 2026-07-02 — Virality Pack Task 5: referrals (MONEY, inert behind
// SF_REFERRALS_ENABLED). One additive table — one row per referee EVER
// (UNIQUE(refereeOrgId)). Credits are wallet_transactions rows only (kind
// 'referral_credit'), never Stripe. See lib/growth/referrals.ts.
export * from "./referrals";

// 2026-07-03 — OAuth 2.1 + DCR for mcp.seldonframe.com/v1 (migration 0063).
// Three additive tables — oauth_clients (public-client DCR registrations),
// oauth_authorization_codes (single-use, PKCE-bound, hashed at rest),
// oauth_refresh_tokens (rotating, family-linked for reuse detection). Inert
// behind SF_OAUTH_ENABLED. See docs/superpowers/specs/2026-07-03-oauth-connector-design.md.
export * from "./oauth";

// 2026-07-03 — Agent Taste Mode (migration 0064): anonymous, flag-gated free
// lane on the agent MCP rental endpoint. One additive table —
// agent_taste_sessions (short-TTL grounding rows keyed by session id). Inert
// behind SF_AGENT_TASTE_MODE. See docs/superpowers/specs/2026-07-03-agent-taste-mode-design.md.
export * from "./agent-taste-sessions";

// 2026-07-03 — Web Activation P1: url_extraction_cache (migration 0065).
// Additive table for caching extraction results keyed by URL hash + kind.
// Repeat pastes of the same URL skip scrape + LLM entirely (~$0). See
// lib/web-build/extraction-cache-store.ts.
export * from "./url-extraction-cache";

// 2026-07-06 — `/dream` loop prerequisite: agent_reflection_events (migration
// 0066). Additive table persisting every vision_check verdict (previously
// console.log-only) so the daily dream routine has a queryable collect
// source. See docs/superpowers/specs/2026-07-06-dream-loop-design.md +
// lib/vision/persist-reflection.ts / collect-reflections.ts.
export * from "./agent-reflection-events";

// 2026-07-10 — Record-to-agent (migration 0067): recording_sessions +
// workflow_recordings. Anonymous, bearer-token-authed rows that collect
// screen recordings, compile a FlowModel, and (post-claim) an
// agent_templates draft. Inert behind SF_RECORD_TO_AGENT. See
// docs/superpowers/specs/2026-07-10-record-to-agent-design.md.
export * from "./recordings";

// 2026-07-11 — Agent lifecycle slice (migration 0068): supervised_runs (one
// real-tool, supervised run of a template — Stage 04 "Run") +
// recording_sessions.answered_questions (Stage 01 "Learned" Q&A record).
// Additive. Inert behind SF_AGENT_LIFECYCLE. See
// docs/superpowers/specs/2026-07-11-agent-lifecycle-design.md.
export * from "./agent-lifecycle";
