# Seldon Brain v2 Spec

## Document purpose
This spec upgrades the current Seldon Brain v1 into a true self-improving, self-compressing, portable knowledge organism inspired by Agentic Stack’s 4-layer memory, salience scoring, and dream cycle, while staying 100 % aligned with SeldonFrame principles (thin harness, fat BLOCK.md skills, multi-tenant privacy, hosted-first, builder-owned memory).

## Version
v2 — April 15 2026 (locked for post-May 1 sprint)

## Core Philosophy
The Brain is not a log. It is the compounding intelligence layer that turns raw events into reusable, owner-controlled knowledge. Intelligence must grow super-linearly with usage while remaining private, cheap, and portable.

## 1. Four-Layer Memory Architecture (replaces v1 flat wiki)

| Layer | Storage | Purpose | Lifetime | Access Pattern |
| --- | --- | --- | --- | --- |
| Working | In-memory (per Seldon It session) | Short-term context for current conversation | Session only | Fastest — used by Seldon It |
| Episodic | Neon Postgres `brain_events` table | Raw, timestamped, anonymized events | Forever (pruned) | Layer 1 queries |
| Semantic | `/brain/wiki/` markdown (industries/concepts/insights) | Abstracted patterns, benchmarks, reusable lessons | Long-term | Lazy-loaded by manifest |
| Personal | Per-workspace `/brain/personal/` folder | Builder-specific long-term knowledge + self-knowledge | Long-term | Progressive disclosure |

## 2. Salience Scoring (new)
Every event gets a salience score (0–1) at write time:

- Calculated by tiny Haiku prompt on `event_type` + payload
- Factors: business impact, rarity, recency, emotional weight (for coaching/consulting), revenue correlation
- High-salience events (> 0.7) are promoted faster

## 3. Dream Cycle (nightly compression — the real intelligence engine)

Runs once per night at 3 AM UTC on the VPS (Haiku only)

Process:
- Pull new/high-salience episodic events since last cycle
- Replay + abstract (REM-style): “What patterns, lessons, or rules can we extract?”
- Promote to Semantic layer (update industry/concept/insight articles)
- Promote to Personal layer (workspace-specific insights)
- Prune low-salience episodic events older than 90 days (intelligent forgetting)
- Self-rewrite hooks: trigger any BLOCK.md that has `self_improve: true`

Cost target remains ~$0.001–$0.005 per active workspace per day

## 4. Progressive Disclosure + Manifest (solves context bloat)

- Every workspace gets a `brain-manifest.json` (auto-generated)
- Seldon It only loads:
  - Working memory (current session)
  - Relevant semantic articles (via manifest tags)
  - Personal layer
- Lazy-loading via simple include mechanism — keeps token count tiny even with 100+ blocks

## 5. Self-Rewrite Hooks for BLOCK.md

- Every BLOCK.md can declare `self_improve: true`
- After successful use (or failure), Brain v2 can propose edits to the skill file itself
- Builder reviews and merges (or auto-apply with confirmation)

## 6. Export Feature — Portable `.agent/` Folder

Builder command: “export my workspace as portable brain”

Produces a clean `.agent/` folder containing:
- `memory/` (episodic + semantic + personal layers)
- `skills/` (all BLOCK.md + manifest)
- `protocols/` (permissions, privacy rules)
- `harness-rules.json`

The exported folder works in any MCP-compatible harness (Claude Code, Cursor, Windsurf, local agent, etc.)
Builder can re-import later or run fully offline

## 7. Privacy & Security (non-negotiable — upgraded)

- All events still anonymized at write time (SHA-256 on `workspace_id` + `client_id` + identifiers)
- Dream cycle never sees raw PII
- Personal layer is encrypted at rest on VPS (optional LUKS for high-security workspaces)
- Export includes a clear “this data is anonymized” header

## 8. Phased Rollout

### Phase 1 (immediate — next 7 days)
Add salience scoring + manifest + progressive disclosure (lowest risk, highest immediate win)

### Phase 2 (2 weeks after launch)
Full dream cycle + 4-layer promotion

### Phase 3 (Month 2)
Self-rewrite hooks + full portable `.agent/` export

## 9. Cost & Scaling (still lean)

- Still Haiku-only for all compilation
- Incremental + salience pruning = cost stays flat even as data grows
- Dream cycle is the only nightly job

## 10. Attribution & Client Timeline (unchanged from v1)
Kept intact — now feeds into the semantic layer automatically.

End of Spec.
