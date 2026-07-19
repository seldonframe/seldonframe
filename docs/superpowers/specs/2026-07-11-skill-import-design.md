# Bet 4 — Skill Import (agentskills.io → trust-upgraded SF agents) — IMPORT-FIRST

**Date:** 2026-07-11 · **Status:** spec (Max approved import-first 2026-07-11) · **Flag:** `SF_SKILL_IMPORT` strict-"1" · **Strategy:** docs/strategy/2026-07-11-hermes-agent-inspiration.md

## 0. What this is

Import any open-standard Agent Skill (agentskills.io: a folder with `SKILL.md` — YAML frontmatter `name`/`description` minimum + instruction body; optional scripts/references/assets) into SF as a **draft agent template** with default guardrails and derived evals — then the existing lifecycle ladder (Verify → Connect → Run → Sell) turns a raw skill into a trust-upgraded, marketplace-listable agent. The wedge: ~40 clients ship this format (Anthropic-originated standard); every published skill is potential SF marketplace supply. **Import is supply acquisition; export comes later.**

## 1. Verified seams (scout recon 2026-07-11)

| Seam | Location | Fact |
|---|---|---|
| Skill slot | `db/schema/agents.ts` L64-66 `AgentBlueprint.customSkillMd` | Markdown prepended to system prompt at runtime (`agent-bundle.ts` ~L204 `foldPromptHint`). 8,000-char cap is DOCUMENTED but **not runtime-enforced** — enforcement ships in this slice. |
| Templates | `db/schema/agent-templates.ts` | id/builderOrgId/blueprint(jsonb)/status/evalScore — draft template is the import target. |
| Import pattern | `app/api/v1/handoff/import/route.ts` | The Claude-Design import rail: validate sizes (64KB/component, 1MB total) → persist → manifest response. Copy this shape. |
| Guardrail defaults | `lib/agents/generate/agent-bundle.ts` ~L34 `defaultGuardrailsForSkill()` + `lib/agents/guardrails/agent-guardrails.ts` | Pure, deterministic defaults per skill archetype; unknown skill → conservative default set (this slice adds one: quiet hours 21–08, daily cap 100, 5-min contact frequency). |
| Marketplace | `lib/marketplace/seller-actions.ts` `publishOrUpdateAgentListingAction` | Template→listing via reserved `tmpl:<id>` tag; the lifecycle gate (evals + supervised run, from the lifecycle slice) already guards publish. |
| Evals | `lib/agents/evals/run-agent-evals.ts` | LLM scenario generator exists — imported skills get scenarios generated from the skill body + description. |
| Security today | (scout finding) | **No sanitization exists** for operator-supplied skill markdown: no size enforcement, no forbidden-tool scan, no injection heuristics. This slice adds the sanitize layer used by BOTH import and the existing editor save path. |

## 2. Design

### Ingest (v1: paste or file)
- Surface: `/studio/agents` → **"Import a skill"** (flag-gated): paste SKILL.md text or upload a single `.md` (folder/zip with scripts = v2; scripts NEVER execute in v1 — see security).
- MCP tool `import_agent_skill` (same core) for the IDE-first builder flow — one new thin tool, reuses the lib core.
- Parse: YAML frontmatter (`name`, `description` required; tolerate the standard's optional fields) + body. Malformed frontmatter → explicit error naming the missing field, never a guessed import.

### Sanitize (new shared layer: `lib/agents/skill-sanitize.ts`)
Applied on import AND retrofit onto template-editor customSkillMd saves:
1. Size: body → 8,000 chars enforced (hard error above, with count shown — no silent truncation).
2. Strip HTML/script blocks; normalize to plain markdown.
3. Tool-reference scan: fenced tool names / `tools:` frontmatter mapped against the SF tool catalog + Composio catalog — recognized ones become proposed capabilities (shown at review), unrecognized ones flagged in the manifest, forbidden set (stateful CRM writes, booking mutations à la the rental-model exclusion list) stripped with a warning line.
4. Injection heuristics: flag (not block) directives targeting the harness ("ignore previous instructions", system-prompt override patterns) — surfaced in the review step; the operator decides. Never silently rewrite content.

### Review → draft template
- Review screen (read-back gate): name, description, what the skill claims to do, proposed capabilities/toolkits, applied guardrail defaults, sanitize warnings. Confirm → draft `agent_templates` row: `customSkillMd` = sanitized body, blueprint w/ conservative trigger (`inbound chat` unless the skill text clearly implies otherwise — reuse `inferTriggerFromModel`'s keyword approach against the skill body), `defaultGuardrailsForSkill` fallback set, eval scenarios generated on first Verify run (existing generator).
- The draft lands on the **lifecycle ladder** like any compiled agent: Learn (import provenance panel: "Imported from SKILL.md — <name> v<hash>"), Verify (generated evals), Connect (toolkit bindings), Run (supervised), Sell (gated publish). **The lifecycle gate is the trust upgrade** — an imported skill can't hit the marketplace without passing evals + a supervised run.

## 3. Security posture (the point, given zero sanitization today)
- v1 imports TEXT ONLY — bundled `scripts/` are never stored or executed (deployed SF agents have no code-exec by design; strategy doc §4).
- Sanitize layer unit-tested per rule; forbidden-tool list is a versioned const with tests.
- Import is org-scoped, builder-authed, rate-limited (reuse an existing per-org rate-limit helper if present; else simple daily cap).
- Provenance stored (source name + content hash) — marketplace listings can disclose "imported skill, SF-verified" honestly.

## 4. Build phases
1. **P1:** sanitize lib + parse + review screen + draft-template creation + provenance panel (lifecycle integration is free once the ladder exists).
2. **P2:** MCP `import_agent_skill` + marketplace listing prefill + "imported & verified" badge.
3. **P3 (upgraded 2026-07-12 from "registry browse" after the never-stops-learning pipeline reflection):** the **skill prospector** — an INTERNAL weekly loop (x-vault operational shape, NOT a product feature) that scouts → extracts → rule-scores → drafts imports, feeding this rail: sources ranked by ICP signal (agentskills registry + curated skill repos [mattpocock/skills · davidondrej/skills · ui-skills.com — also the P1 seed corpus] > GitHub search scoped to SMB-job keywords > trending); filter criterion = "is this an SMB front-office JOB", never "is this an AI workflow"; deterministic score gate before any LLM stage; **license + provenance captured at scout time, permissive-only for anything marketplace-bound (hard requirement — sold skills need attribution)**; every draft still enters the lifecycle ladder — evals + supervised run remain the trust gate (the differentiated claim: executed and verified, not scraped). Measure import→verified→listed before productizing. Bulk import for agencies rides this.

Estimate: P1 ≈ 900–1,200 LOC incl. tests (sanitizer is cross-ref-validator-class — L-17 2.5–3.0x test band on ~5–6 rule edges).

## 5. KPIs
Imports/week · import→verified conversion (evals passed) · verified→listed conversion · listed-import GMV share.

## 6. Non-goals (v1)
Script execution · zip/folder ingest · export of SF blocks to the standard (explicitly later, per Max) · auto-publish · registry crawling.
