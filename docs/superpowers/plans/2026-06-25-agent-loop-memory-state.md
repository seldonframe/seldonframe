# Agent Loop-Memory (State) — L1 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkboxes track steps.

**Goal:** Wire **Soul + Brain v2 + RunContext** as agent **loop-memory** so an agent remembers across runs — recalls "what I did / what failed / what's next" before acting, and records what it did after. First payoff: the event-triggered agents (Review-requester, Speed-to-lead) stop being stateless one-shots; the bespoke review throttle becomes one **recall** against memory.

**Architecture:** A pure `agent-memory.ts` owns the memory model + key derivation + the "already-did" predicate (DI'd over a store). The store is backed by **Brain v2** (`brain_notes`, namespaced per agent+subject). `run-event-agent` recalls before composing + records after sending. `RunContext` carries the recalled/recorded memory so `/runs` shows it and a run resumes cold. Soul stays the grounding read-context (already consumed).

**Spec:** `docs/superpowers/specs/2026-06-25-unified-agent-model-design.md` (Post-P1 → State).

**Conventions:** verify `pnpm -C packages/crm typecheck` (baseline 0 — RE-RUN yourself), `bash packages/crm/scripts/check-use-server.sh src`, `pnpm -C packages/crm build`. Commit per task; push at the end. Work in `icp3-wedge`.

---

### Task T1: `agent-memory.ts` — the memory model (pure, TDD)
**Files:** Create `src/lib/agents/memory/agent-memory.ts` + `tests/unit/agents/memory/agent-memory.spec.ts`.
- [ ] Define:
  ```ts
  export type AgentMemoryEntry = {
    at?: string;                 // ISO; set by the caller/clock, not in pure code
    kind: string;                // e.g. "review_requested", "lead_contacted", "note"
    summary: string;             // human/agent-readable one-liner
    data?: Record<string, unknown>;
  };
  export type AgentMemoryStore = {
    read: (key: string) => Promise<AgentMemoryEntry[]>;
    append: (key: string, entry: AgentMemoryEntry) => Promise<void>;
  };
  export function memoryKey(args: { orgId: string; agentKey: string; subjectKey: string }): string;
  //  → stable namespaced path e.g. `agents/<agentKey>/<subjectKey>` (sanitize each segment: lowercase,
  //    strip/replace anything not [a-z0-9._-], collapse repeats; never empty → "_" fallback).
  export async function recallAgentMemory(store, args: { orgId; agentKey; subjectKey }): Promise<AgentMemoryEntry[]>;
  export async function recordAgentMemory(store, args: { orgId; agentKey; subjectKey; entry: AgentMemoryEntry }): Promise<void>;
  export function hasDone(entries: AgentMemoryEntry[], kind: string): boolean;  // generalizes the throttle
  ```
- [ ] Tests (TDD): `memoryKey` sanitizes/namespaces (e.g. phone `+1 (325) 413-2487` → safe segment; uppercase→lower; empty→`_`); `recallAgentMemory` returns the store's entries (and `[]` if the store throws → never throw); `recordAgentMemory` calls `append` with the entry; `hasDone` true iff an entry of that kind exists. Verify (test + typecheck + check-use-server). Commit.

### Task T2: Brain v2 store backing (`brain_notes`)
**Files:** Create `src/lib/agents/memory/brain-memory-store.ts` + spec. INVESTIGATE FIRST: the internal Brain v2 API — grep `brain_notes`, `writeBrainNote`, `readBrainPath`, `src/lib/brain/**`, the `brain-notes` schema (exported from the schema index, commit 248ef12d). Find how a note is written/read server-side (path + content + orgId).
- [ ] Implement `makeBrainMemoryStore(deps)` → `AgentMemoryStore`: `read(key)` loads the brain note at `memory/<key>.json` (or the brain's native path convention) for the org and parses the entry array (missing → `[]`); `append(key, entry)` reads, pushes, writes back (JSON array in the note body). Use the EXISTING brain write/read lib (don't add a table). DI the brain read/write + orgId so it's unit-testable with a fake; soft-fail (a brain error → read returns `[]`, append swallows + logs).
- [ ] Test (DI fake brain): append-then-read round-trips; read of a missing note → `[]`; a brain failure → `[]`/no-throw. Verify (test + typecheck + check-use-server). Commit. (If Brain v2 truly has no server-callable read/write, fall back to an additive `agent_memory` jsonb store + a 00NN migration — but prefer Brain v2; report which you used.)

### Task T3: Recall + record in `run-event-agent`
**Files:** `src/lib/agents/triggers/run-event-agent.ts` + `run-event-agent-deps.ts` (+ extend its spec).
- [ ] In `runEventAgent`: before composing, **recall** memory for `{ orgId, agentKey: <skill or templateId>, subjectKey: <contactId> }` and (a) replace the bespoke `hasAlreadyRequested` throttle with `hasDone(entries, "review_requested")` for the review agent, (b) pass a short prior-interaction summary into the skill composer where useful (e.g. speed-to-lead can note "already contacted earlier" — keep the composer signatures back-compatible, optional arg). After a successful send, **record** an entry (`kind: "review_requested"`/`"lead_contacted"`, summary, data: channel + messageId). Wire the store via `buildRunEventAgentDeps` (production = `makeBrainMemoryStore`). Keep the existing metadata.source tag too (belt-and-suspenders) and keep soft-fail.
- [ ] Tests: a `booking.completed` with empty memory → composes + sends + records `review_requested`; a second event where memory already `hasDone("review_requested")` → throttled (no send); `lead.created` → records `lead_contacted`. Use a fake store (no Brain/Postgres). Verify (tests + typecheck + check-use-server + build). Commit.

### Task T4: RunContext carries the memory (surface on /runs)
**Files:** the RunContext type + its persistence/snapshot (grep `RunContext`, `buildRunContext`, the `/runs` snapshot) + the `/runs` render.
- [ ] Add an optional `memory?: { recalled: AgentMemoryEntry[]; recorded: AgentMemoryEntry[] }` to the RunContext snapshot for event-agent runs, populated from T3, so `/runs` shows what the agent remembered + wrote. Keep it additive/optional (other run types unaffected). If the event-agent path doesn't currently build a RunContext, the smallest move is to persist a lightweight run record carrying the memory — describe + do the minimal safe thing; don't force a large refactor. Verify (typecheck + check-use-server + build). Commit. **Push.**

### Task T5: Verify + push
- [ ] `pnpm -C packages/crm typecheck` (0) · memory + trigger + skills suites green · `check-use-server` clean · **`pnpm build` exit 0**. Push. Surface the manual smoke: fire `booking.completed` twice for one contact → one review SMS + a `review_requested` note in the workspace Brain; `/runs` shows the recalled/recorded memory.

---

## Self-Review
- **Spec coverage (State primitive):** Soul = grounding (already consumed) · **Brain v2 = durable recall/record** (T1+T2+T3) · **RunContext carries it** (T4) · throttle generalized to a recall (T3). ✓
- **Type consistency:** `AgentMemoryEntry`, `AgentMemoryStore{read,append}`, `memoryKey`, `recall/recordAgentMemory`, `hasDone`, `makeBrainMemoryStore`. ✓
- **Risk flag:** T2 depends on the internal Brain v2 read/write API — the implementer MUST find it first; the additive `agent_memory` jsonb is the documented fallback. T4 must not force a RunContext refactor — minimal safe persistence only.
- **Non-goals:** Verify gate (L2) + Guardrails/Stop (L3) + generate-by-default (L4) are separate phases.
