// Agent Loop — L4 Generate-by-Default — Task T3: the PURE orchestration.
//
// runGenerateAgentDraft is the testable heart of the generate-by-default server
// action. It wires the three already-built pieces into one flow:
//
//   sentence → parseAgentIntent (heuristic + optional LLM classify, fail-soft)
//            → assembleAgentBundle (the deterministic safety assembler)
//            → create a NEW owned agent template from the bundle
//            → { ok, templateId, warnings }
//
// EVERY external effect is an injected dependency (`getOrgId`, `classify`,
// `create`), so the whole flow is unit-testable with in-memory fakes — NO real
// LLM, NO Postgres. The thin "use server" wrapper (actions.ts) supplies the real
// deps; this module is NOT "use server" so a test can import it directly.
//
// Fail-soft by construction:
//   • a `classify` that throws is already swallowed INSIDE parseAgentIntent (it
//     falls back to the pure heuristic), so the bundle is always built;
//   • the assembler never throws and always yields a safe blueprint;
//   • only a missing org (→ "unauthorized") or a `create` failure (→ its error)
//     can make this return `{ ok: false }`.

import type { AgentBlueprint } from "@/db/schema/agents";
import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";
import {
  assembleAgentBundle,
  resolveSkillAlias,
} from "@/lib/agents/generate/agent-bundle";
import {
  authorAgentDraft,
  type AgentAuthor,
} from "@/lib/agents/generate/authored-agent";
import { composeBundleFromAuthored } from "@/lib/agents/generate/compose-authored";
import {
  judgeGeneratedAgent,
  applyJudgeFixes,
  type AgentGrader,
} from "@/lib/agents/generate/judge";
import {
  recallGeneratorLessons,
  recordGeneratorLesson,
  lessonsToPromptHint,
} from "@/lib/agents/generate/generator-lessons";
import type { AgentMemoryStore } from "@/lib/agents/memory/agent-memory";
import { parseAgentIntent, type AgentIntent } from "@/lib/agents/generate/parse-intent";
import {
  STARTER_TEMPLATES,
  type StarterTemplate,
} from "@/lib/agent-templates/starter-pack";
import type { AgentTemplateType } from "@/lib/agent-templates/store";

// ─── deps + io ────────────────────────────────────────────────────────────────

/** What the orchestrator hands the create seam: the assembled bundle's identity
 *  + its full, safe blueprint (trigger + verify + guardrails + reviewUrl + the
 *  hint-folded skill prose all populated). `type` is the template type the new
 *  row should carry (voice_receptionist | chat_assistant). */
export type CreateAgentDraftInput = {
  builderOrgId: string;
  name: string;
  description: string;
  type: AgentTemplateType;
  blueprint: AgentBlueprint;
};

/**
 * The result of resolving the author's plain-English `neededCapabilities` (P5.4):
 *   • `bindings`   — real composio {@link ConnectorBinding}s for the matched
 *                    capabilities, ready to merge onto blueprint.connectors;
 *   • `resolved`   — the matched {capability, slug, label} triples (UX/telemetry);
 *   • `unresolved` — the capability phrases that found NO integration (each becomes
 *                    an operator warning so they know it'll be skipped).
 * Fail-soft by construction at the resolver: no COMPOSIO key → empty catalog →
 * nothing resolves → every capability lands in `unresolved` (just warnings).
 */
export type ResolveCapabilitiesResult = {
  bindings: ConnectorBinding[];
  resolved: { capability: string; slug: string; label: string }[];
  unresolved: string[];
};

/**
 * The injectable effects. `getOrgId` resolves the operator's org from session
 * (null when unauthorized); `classify` is the optional LLM refiner merged over
 * the heuristic (omit it → heuristic only); `judge` is the optional maker≠checker
 * grader that reviews the assembled bundle and may auto-fix low-risk plumbing
 * (omit it → no review, today's behavior); `create` persists the new template
 * and returns its id (or throws / returns an error result on failure).
 */
export type GenerateDeps = {
  getOrgId: () => Promise<string | null>;
  /** The optional LLM classifier merged over the heuristic (omit → heuristic
   *  only). Receives the sentence and, when L5.3 is wired, an optional
   *  `priorLessons` hint of past corrections it may fold into its prompt. */
  classify?: (
    sentence: string,
    priorLessons?: string,
  ) => Promise<Partial<AgentIntent>>;
  /** Optional LLM AGENT AUTHOR — the primitive-composition path. When present (and
   *  it returns a valid draft), it AUTHORS the agent: writes its full playbook and
   *  DECLARES its trigger/channel/tools as structured output, which the composer
   *  (composeBundleFromAuthored) wires into a bundle with SF's deterministic safety
   *  floor. Tried FIRST, fail-soft: a missing author, or one that throws / returns
   *  garbage (→ authorAgentDraft yields null), falls back to the classify →
   *  assemble heuristic path below — so generation never blocks on the LLM and the
   *  tested template path stays the floor. Receives the recalled `priorLessons`
   *  hint, same as the classifier. */
  author?: AgentAuthor;
  /** Optional maker≠checker grader. When present, runs AFTER the deterministic
   *  assembler: it reviews the bundle against the sentence, auto-applies the
   *  allow-listed low-risk fixes (trigger/verify/guardrails/connectors), and
   *  surfaces the un-fixable issues as warnings. Fail-open — a broken/throwing
   *  judge NEVER blocks generation (judgeGeneratedAgent guards it). */
  judge?: AgentGrader;
  /** Optional generator loop-memory (L5.3 self-improving loop). When present,
   *  past `{pattern,mistake,correction}` lessons for this org are RECALLED and
   *  folded into the classify + judge prompts (so the generator stops repeating
   *  a fix), and each judge fix applied here is RECORDED back as a new lesson.
   *  Omit it → no recall, no record (today's behavior, byte-for-byte). All
   *  best-effort: a store error never breaks a generation. */
  lessonsStore?: AgentMemoryStore;
  /** Optional LIVE capability resolver (P5.4 — the long-tail integration binder).
   *  When present AND the AUTHOR path produced `neededCapabilities` (plain-English
   *  asks NOT in the featured tool menu), this maps each phrase to a real composio
   *  toolkit binding (via Composio's live catalog) and reports which phrases found
   *  no integration. Its `bindings` are merged onto blueprint.connectors (deduped
   *  by kind+id); each `unresolved` phrase becomes an operator warning. Omit it →
   *  no resolution (today's behavior). Fail-soft by contract: the orchestrator
   *  wraps the call so a resolver error never breaks generation, and the resolver
   *  itself fails soft to "everything unresolved" when there's no COMPOSIO key. */
  resolveCapabilities?: (
    capabilities: string[],
  ) => Promise<ResolveCapabilitiesResult>;
  create: (
    input: CreateAgentDraftInput,
  ) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
};

export type GenerateAgentDraftInput = {
  sentence: string;
  /** The business's known Google review URL (from its GBP link), if any. Wins
   *  over a URL the classifier found in the sentence; lets a review-requester
   *  agent be generated complete instead of with a "set your review URL"
   *  warning. */
  reviewUrl?: string;
};

export type GenerateAgentDraftOutput =
  | { ok: true; templateId: string; warnings: string[] }
  | { ok: false; error: string };

// ─── template type for a skill ────────────────────────────────────────────────

/** Resolve the template TYPE a generated agent should be created as. The
 *  alias-resolved starter's type wins (so "receptionist" → the
 *  ai-phone-receptionist starter → voice_receptionist); an unrecognized skill
 *  defaults to chat_assistant (a safe text agent — matches the assembler's
 *  generic inbound-chat fallback). Pure. */
function templateTypeForSkill(skill: string): AgentTemplateType {
  const id = resolveSkillAlias(skill);
  const starter: StarterTemplate | undefined = STARTER_TEMPLATES.find(
    (s) => s.id === id,
  );
  return starter?.type ?? "chat_assistant";
}

/** Resolve the template TYPE for an AUTHORED bundle (the primitive-composition
 *  path, which has no `intent.skill` to look a starter up by). The template type
 *  is just the DB row's surface — the real behavior lives in the blueprint — so we
 *  key it off the only axis that distinguishes the two row types: an inbound VOICE
 *  agent is a `voice_receptionist`; everything else (chat / sms / email, plus every
 *  action-only schedule/event poster) is a `chat_assistant` (the safe text type,
 *  matching the heuristic path's default). Pure. */
function templateTypeForBlueprint(blueprint: AgentBlueprint): AgentTemplateType {
  const trigger = blueprint.trigger;
  return trigger?.kind === "inbound" && trigger.channel === "voice"
    ? "voice_receptionist"
    : "chat_assistant";
}

// ─── lesson pattern key ─────────────────────────────────────────────────────

/** The recognizable "situation" a recorded lesson keys on (L5.3): a short,
 *  normalized lead of the operator's sentence. We don't store the whole prose
 *  (a lesson's `pattern` is a cue, not a transcript) — just the first ~80 chars,
 *  whitespace-collapsed. Empty/garbage in → "a request" so the lesson still has
 *  a non-empty pattern (recordGeneratorLesson drops empty-pattern lessons). Pure. */
function firstSentenceFeature(sentence: string): string {
  const text = (typeof sentence === "string" ? sentence : "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "a request";
  return text.length > 80 ? `${text.slice(0, 80).trim()}…` : text;
}

// ─── connector merge (P5.4) ──────────────────────────────────────────────────

/**
 * Merge resolved long-tail bindings onto a blueprint's existing connectors,
 * DEDUPED by `kind`+`id` (the same key the binders use in bind-tools.ts), with the
 * existing bindings winning on a clash and order preserved (existing first, then
 * the new). Returns `undefined` when the result is empty so a no-connector
 * blueprint keeps `connectors` unset (mirrors compose-authored / agent-bundle,
 * which only set the field when non-empty). Pure; never throws, never mutates
 * either input array. */
function mergeConnectors(
  existing: ConnectorBinding[] | undefined,
  added: ConnectorBinding[],
): ConnectorBinding[] | undefined {
  const base = Array.isArray(existing) ? existing : [];
  const extra = Array.isArray(added) ? added : [];
  const out: ConnectorBinding[] = [];
  const seen = new Set<string>();
  for (const binding of [...base, ...extra]) {
    if (!binding || typeof binding.id !== "string") continue;
    const key = `${binding.kind}:${binding.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(binding);
  }
  return out.length > 0 ? out : undefined;
}

// ─── orchestrator ──────────────────────────────────────────────────────────────

/**
 * Turn one English sentence into a created agent template. Pure orchestration
 * over injected deps (no real LLM / DB). Flow:
 *   1. getOrgId → null ⇒ { ok:false, error:"unauthorized" } (nothing created);
 *   1b. (optional, L5.3) recall this org's past generator lessons → a prompt
 *      hint threaded into the classifier + judge below. Omitted store → no
 *      recall; "" hint → both prompts unchanged;
 *   2. bundle selection — AUTHOR-FIRST, fail-soft:
 *      2a. authorAgentDraft(sentence, { author, priorLessons }) → an AuthoredAgent
 *          or null (fail-soft: no author / it throws / it returns garbage → null);
 *      2b. authored ? composeBundleFromAuthored(authored, { reviewUrl }) — the
 *          primitive-composition path (authored playbook + SF's deterministic
 *          safety floor) — : the prior HEURISTIC path unchanged
 *          (parseAgentIntent(sentence,{classify,priorLessons}) → assembleAgentBundle),
 *          so a missing/failed author is a zero-regression degrade to today's path;
 *   3b. (optional) judge the bundle (maker≠checker) — auto-fix low-risk plumbing,
 *      surface the rest as warnings. Fail-open; omitted → step skipped entirely.
 *      Each applied fix is RECORDED (L5.3) as a lesson for the next generation;
 *   4. create the template from the (possibly judge-fixed) bundle → its id;
 *   5. { ok:true, templateId, warnings }.
 *
 * The receptionist alias is applied INSIDE the assembler (resolveSkillAlias in
 * starterForSkill), so an intent of skill "receptionist" already lands on the
 * ai-phone-receptionist starter here — no extra remapping needed.
 */
export async function runGenerateAgentDraft(
  deps: GenerateDeps,
  input: GenerateAgentDraftInput,
): Promise<GenerateAgentDraftOutput> {
  const sentence = typeof input.sentence === "string" ? input.sentence.trim() : "";
  if (!sentence) return { ok: false, error: "empty_sentence" };

  const orgId = await deps.getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  // L5.3 — recall this org's past generator corrections (fail-soft to []) and
  // render them into a prompt hint we thread into BOTH the classifier and the
  // judge below, so the generator stops repeating a fix. "" when there are none
  // (or no store), which leaves both prompts byte-for-byte unchanged.
  const lessons = deps.lessonsStore
    ? await recallGeneratorLessons(deps.lessonsStore, { orgId })
    : [];
  const priorLessons = lessonsToPromptHint(lessons);

  const ctx = { reviewUrl: input.reviewUrl };

  // ── bundle selection: AUTHOR-FIRST, fail-soft to the heuristic ──────────────
  //
  // 1. Try the primitive-composition path: the LLM AUTHORS the agent (writes its
  //    playbook + declares its primitives), and the composer wires SF's safety
  //    floor deterministically. authorAgentDraft is fail-soft by construction — no
  //    author dep, or one that throws / returns garbage → null.
  // 2. On null (no LLM author, or it failed), fall back to TODAY's heuristic path:
  //    parseAgentIntent (classify fail-soft inside it) → assembleAgentBundle. This
  //    is byte-for-byte the prior behavior, so a missing author / failed author is
  //    a zero-regression degrade and the tested template path stays the floor.
  //
  // EVERYTHING AFTER (judge → applyJudgeFixes → warnings, lessons record, create)
  // runs on `bundle` identically for both paths — it's the same AgentBundle shape.
  const authored = await authorAgentDraft(sentence, {
    author: deps.author,
    priorLessons,
  });

  // The heuristic intent is only computed on the fallback path (the authored path
  // doesn't classify a skill). It also carries the template TYPE for that path.
  const intent: AgentIntent | null = authored
    ? null
    : await parseAgentIntent(sentence, {
        classify: deps.classify,
        priorLessons,
      });

  let bundle = authored
    ? composeBundleFromAuthored(authored, ctx)
    : assembleAgentBundle(intent!, ctx);

  // ── P5.4 — resolve the author's long-tail capabilities → real bindings ──────
  //
  // The AUTHOR (and only the author — the heuristic path has no neededCapabilities)
  // may declare plain-English asks NOT in the featured tool menu ("read my Google
  // reviews", "create a Trello card"). When a `resolveCapabilities` dep is present,
  // map each phrase to a real composio toolkit binding via Composio's LIVE catalog,
  // MERGE those bindings onto the blueprint (deduped by kind+id, so an authored
  // featured-tool binding is never duplicated), and surface every phrase that found
  // NO integration as an operator warning. Wrapped end-to-end in try/catch and
  // gated on the dep + a non-empty list, so a resolver hiccup (or no dep) NEVER
  // breaks generation — it just degrades to "no long-tail bindings". The heuristic
  // path is untouched (authored is null → no neededCapabilities → skipped).
  if (deps.resolveCapabilities && authored?.neededCapabilities?.length) {
    try {
      const result = await deps.resolveCapabilities(authored.neededCapabilities);
      bundle.blueprint.connectors = mergeConnectors(
        bundle.blueprint.connectors,
        result.bindings,
      );
      for (const capability of result.unresolved) {
        bundle.warnings.push(
          `No integration found yet for: ${capability} — connect one in Integrations or it'll be skipped.`,
        );
      }
    } catch {
      // Fail-soft: a capability-resolution error must never break (or block) a
      // generation. The bundle is already safe + persistable without the long tail.
    }
  }

  // Optional maker≠checker review. judgeGeneratedAgent FAILS OPEN (a throwing or
  // malformed grader → {ok:true,issues:[]}), so this never blocks the (already
  // safe) generation. applyJudgeFixes merges only the allow-listed low-risk
  // fields (trigger/verify/guardrails/connectors); the un-auto-fixed issues
  // (those without a `fix`) become operator-facing warnings on the bundle.
  if (deps.judge) {
    const verdict = await judgeGeneratedAgent(
      { sentence, bundle, priorLessons },
      { grader: deps.judge },
    );
    bundle = applyJudgeFixes(bundle, verdict);
    bundle.warnings.push(
      ...verdict.issues.filter((i) => !i.fix).map((i) => i.problem),
    );

    // L5.3 — the compounding loop: every fix the judge actually applied is a
    // correction worth remembering. Record one lesson per FIXED issue so the
    // next generation recalls it (above) and the maker stops making it. Guarded
    // on the store + best-effort: recordGeneratorLesson already swallows store
    // errors, and we await so a record settles, but never let it throw.
    if (deps.lessonsStore) {
      const store = deps.lessonsStore;
      const feature = firstSentenceFeature(sentence);
      for (const issue of verdict.issues) {
        if (!issue.fix) continue;
        try {
          await recordGeneratorLesson(store, {
            orgId,
            lesson: {
              pattern: feature,
              mistake: issue.problem,
              correction: JSON.stringify(issue.fix),
            },
          });
        } catch {
          // Best-effort: failing to remember a lesson must never break a
          // generation (the bundle is already assembled + persisted next).
        }
      }
    }
  }

  // Template TYPE: the heuristic path keys off the classified skill's starter; the
  // authored path (no skill) keys off the composed blueprint's resolved trigger.
  // (Both read the POST-judge bundle, so a judge trigger fix is reflected here.)
  const type = intent
    ? templateTypeForSkill(intent.skill)
    : templateTypeForBlueprint(bundle.blueprint);

  const created = await deps.create({
    builderOrgId: orgId,
    name: bundle.name,
    description: bundle.description,
    type,
    blueprint: bundle.blueprint,
  });

  if (!created.ok) return { ok: false, error: created.error };

  return { ok: true, templateId: created.id, warnings: bundle.warnings };
}
