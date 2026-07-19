# Automations truth — generalize-error observability + the two doors + your-agents strip

**Branch:** `fix/automations-truth` @ `637792323` · **Origin:** Max's live run 2026-07-16 ("Couldn't check for personal details" + "i don't see the agents for zen in /automations" + "we basically have two paths… right?") · **Flag:** none (bug fix + navigation truth; all additive)

## Three fixes, one slice

### 1. Generalize action: fail loudly, fail specifically (bug — §2.6)
`proposeTemplateGeneralizationAction` (lib/agent-templates/generalize-actions.ts) returns typed errors (`unauthorized | template_not_found | empty_skill_md | llm_failed | malformed_llm_output`) but (a) logs NOTHING server-side — Max's failure left zero trace in Vercel logs — and (b) the Sell-card panel renders ONE generic message ("Couldn't check for personal details. Try again.") for all five.
- Server: on every non-ok result AND inside the llm/parse failure paths, `console.error("[generalize] propose failed", { templateId, orgId, error: <typed>, upstream: <err.message — scrubbed with the receipts scrubSecretShapes helper> })`. The upstream Anthropic error message (model-not-found, 401, overloaded) is the diagnostic we were missing. Never include skill-md content in the log line.
- Also log the model id used (`process.env.ANTHROPIC_EVAL_MODEL || DEFAULT_GENERALIZATION_MODEL`) in that error line — memory flags stale env model pins as a live risk class, and this makes the next failure self-diagnosing.
- UI (components/marketplace/generalize-template-panel.tsx): map typed errors to distinct honest messages — `llm_failed`: "The AI check couldn't run (model or key issue on our side) — try again in a minute." · `malformed_llm_output`: "The AI returned something unusable — try again." · `empty_skill_md`: "This agent has no instructions to check." · auth/not_found: existing generic. Keep retry affordance.
- Tests: action returns each typed error → panel renders the mapped message (renderToString); the console.error fires with scrubbed upstream (DI/spy per existing test conventions in generalize.spec).

### 2. Custom Workflow card → the two doors (navigation truth)
The /automations "Custom Workflow — COMING SOON" card is wrong: the custom path exists. Locate the card (grep "Custom Workflow" + "COMING SOON" under app/(dashboard) or components). Replace with an ENABLED card: title "Custom Agent", copy "Build any workflow as an agent — describe it in Studio, or record yourself doing it once." Two links/buttons: "Describe it →" → /studio/agents · "Record it →" → /record. Match the existing card grid styling (L-36 visibility invariants on the two links). Remove the COMING SOON badge. If the card copy mentions a future release, delete that sentence.
- Tests: renderToString — card renders both links with correct hrefs; no "COMING SOON" text remains on the page fixture.

### 3. "Your agents" strip on /automations (P4-lite, NOT the full fold-in)
Above or below AVAILABLE TEMPLATES on app/(dashboard)/automations (locate exact page), render a compact org-scoped strip: for each DEPLOYED agent in the current workspace (deployments joined to templates, reuse the existing deployment listing used by studio — do NOT write new query logic if a loader exists; check lib/agent-receipts/store.ts + the studio page's deployment loader), one row: agent name · trigger kind chip (push/schedule/event) · live dot when active (reuse getDeploymentLiveStatus shape) · link → /studio/agents/[templateId]. Empty state: one line "No deployed agents yet — build one:" with the same two links as fix 2. This answers "where are my agents" WITHOUT rebuilding /automations (the full fold-in stays the named roadmap item).
- Tests: renderToString with fixture deployments — rows render, links correct, empty state renders; org-scoping test on the loader if any new query is added.

## Build plan (TDD, commit per fix, baselines first, junctions per L-37, chunked runner if ENAMETOOLONG)
Task 1 = fix 1 · Task 2 = fix 2 · Task 3 = fix 3 · Task 4 = regression sweep + build report (docs/superpowers/specs/2026-07-16-automations-truth.build-report.md). No migrations. Nothing under lib/agents/generate/**. Out of scope: the full /automations↔agents fold-in · execute-on-approve · anything marketplace beyond the panel's error copy.
