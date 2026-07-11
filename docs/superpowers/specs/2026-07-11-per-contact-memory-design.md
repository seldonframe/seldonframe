# Bet 2 — Per-Contact Memory ("what your agent remembers about Mrs. Jones")

**Date:** 2026-07-11 · **Status:** spec (Max approved 2026-07-11; build after Bet 1 kickoff) · **Flag:** `SF_CONTACT_MEMORY` strict-"1" · **Strategy:** docs/strategy/2026-07-11-hermes-agent-inspiration.md

## 0. What this is

Deployed agents build a bounded, agent-curated profile of each END CUSTOMER (contact) and recall it every turn; the operator sees, edits, exports, and deletes it in the CRM. Hermes's Honcho user-modeling translated to SF's multi-tenant shape. This is data gravity: the longer an agent runs, the more it knows that a rival can't.

## 1. Verified seams (scout recon 2026-07-11)

| Seam | Location | Fact |
|---|---|---|
| Store | `db/schema/brain-notes.ts` + `lib/brain/store.ts` (`readBrainNote/writeBrainNote`) | Org-scoped file-tree note store keyed `(orgId, scope, path)`; markdown body; confidence/uses/wins built in. Agent memory already rides it (`lib/agents/memory/brain-memory-store.ts`, path `memory/agents/<agentKey>/…`). |
| Injection point | `lib/agents/prompt.ts` `ComposeSystemPromptInput` | **`brainNotes?: string[]` field ALREADY EXISTS and is unused** — `runtime.ts:259` composes without it. The seam is pre-built. |
| Contact link | `db/schema/conversations.ts` `contactId` FK; `findContactByPhone()` in `lib/sms/api.ts:318` | Conversations resolve to contacts for SMS/voice inbound; email/chat resolution exists on the same shape. |
| Lesson-writing pattern | `lib/agents/evals/eval-lessons.ts` `recordEvalLessons()` | Post-hoc distillation writing org-scoped Brain notes via the AgentMemoryStore seam — the curation loop copies this shape. |
| Operator surface | `app/(dashboard)/contacts/[id]/page.tsx` | Overview tab aside (next to Portal Access card ~L295) is the slot for the memory card; tabs incl. notes/activity already exist. |

## 2. Design

### Profile note
- Path convention: `contacts/<contactId>/profile.md`, org-scoped (`scope:"workspace"`), one note per contact. **Bounded:** ≤1,200 chars, structured markdown sections — `## Preferences · ## Situation (equipment/property/account facts) · ## History highlights · ## Tone`. The bound forces curation (Hermes: "bounded, curated"), not transcript accumulation.
- Metadata: `source:'contact-curation'`, uses/wins updated when a turn recalls it (use) and the conversation ends without escalation/validator failure (win) — the existing Bayesian fields prune stale profiles naturally.

### Recall (per turn)
- `executeTurn`: after conversation load, if `conversation.contactId` and flag on → `readBrainNote(orgId, contacts/<id>/profile.md)` → pass as `brainNotes: ["What you remember about this customer:\n" + body]` into `composeSystemPrompt`. One read, fail-soft (null → no injection). Token cost ≤ ~400.

### Curation (post-conversation)
- On conversation close (or nightly sweep for orgs without close events — reuse the cron rail): one LLM distillation call per conversation-with-contact: input = existing profile + conversation transcript (org's own data only) → output = revised profile (Zod-gated sections, hard 1,200-char cap) + `changed: boolean`. Write only when changed. DI, offline-testable.
- **Scrub list enforced at write:** never store payment card fragments, SSN-shapes, passwords/credential shapes (regex gate, tested); prefer stable facts over one-off details (prompt rule).
- Idempotent per conversation (`curatedAt` stamp on conversation or a processed-log) — no double-distill.

### Operator surface (privacy posture per Max: visible · exportable · deletable)
- Contact overview card **"What your agent remembers"**: renders the profile sections, `Edit` (inline textarea → write note), `Clear memory` (delete note, confirm), timestamp of last update.
- Export: profile included in existing contact export path (find at build; if none, CSV/JSON contact export gains a `agent_memory` column — additive).
- Portal-facing (end-customer) display: NOT in v1 (operator-only). Revisit with Max after ToS wording.

## 3. Never-lies / guards
- The card shows exactly the injected text — what the operator reads IS what the agent recalls (single note, no hidden layers).
- Curation claims nothing: it writes or it doesn't; the card timestamp is the read-back.
- Org-scope every read/write (the recurring bug class); contact deletion cascades the note (wire into existing contact-delete path).
- Optimistic-path: distillation failure = profile unchanged + logged, never a half-written note (single-row write).

## 4. Build phases
1. **P1 recall + card (read-only):** injection seam + manual "Edit memory" card (operator-authored profiles work day one — value before automation). Migration-free (brain_notes exists).
2. **P2 curation loop:** post-conversation distillation + scrub gate + idempotency.
3. **P3 lifecycle polish:** export wiring, contact-delete cascade, uses/wins pruning, agency roll-up view.

## 5. KPIs
Profiles created/week per org · recall rate (turns with injection) · win-rate delta on conversations with vs without profile (escalation + validator failure rates) · operator edits/clears (trust signal).

## 6. Non-goals
Cross-contact or cross-org aggregation (never) · end-customer-visible memory (v2 decision) · vector/embedding memory (the bounded note IS the design — no RAG infra) · storing raw transcripts in the profile.
