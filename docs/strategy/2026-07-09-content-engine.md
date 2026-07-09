# Content Engine — tool clusters + the weekly high-intent article loop

_Status: PLAN (approved 2026-07-09). Reference doc — build in phases below._
_Owner: Max. Decisions in §6 are settled; don't re-litigate without a reason._

## 0. Goal

Turn the free tools and the citable-listicle machine into a compounding
inbound engine: rank for high-intent queries, get cited by answer engines
(GEO), and funnel readers into a working free tool → a SeldonFrame workspace.
Two workstreams:

1. **Tool clusters** — 5–8 supporting articles per published free tool
   (pillar-and-spoke). Highest-value, lowest-risk. Build first.
2. **Weekly article loop** — a cron that researches (DataForSEO), plans, drafts,
   quality-gates, and publishes ~10–20 high-intent articles/week, then emails a
   digest via Resend.

## 1. Principles (inherited from CLAUDE.md + the citable-listicle work)

- **Reuse, don't rebuild.** Articles are a data-driven registry rendered by one
  template — the SAME machine as `best-pages.ts` — so they inherit `.md` twins,
  sitemap + llms.txt registration, `Article` JSON-LD, the E-E-A-T author byline,
  IndexNow ping, and a spec test. No parallel blog CMS.
- **never-lies applies to content.** Every factual claim is hedged or cited to a
  real source; no fabricated studies, stats, or a business's facts. This is a
  hard gate, not a style note.
- **Pillar → spoke → tool.** Every article links to its tool (the conversion
  asset) and the relevant `/best` guide. The tool is the payoff, not a signup wall.
- **Quality is the moat, volume is the vanity metric.** Approved-indexed-ranking
  is the KPI, not articles shipped.

## 2. Part 1 — Tool clusters (build first)

Each published tool is a **pillar**; its cluster is 5–8 informational spokes.

### 2.1 DataForSEO's job (select, don't just generate)
- **Keyword ideas + search volume + difficulty** (DataForSEO Labs): pull the
  real query universe per tool topic; keep terms with genuine demand AND
  rankable difficulty for a young domain.
- **SERP + People-Also-Ask + related searches**: these become the article H2s
  and FAQ — what wins snippets and LLM citations.
- **Dedupe** against the live sitemap so no two pages target one intent.

### 2.2 Seed clusters (DataForSEO confirms/prunes by volume)
- **Speed-to-Lead Calculator**: what is speed-to-lead · the 5-minute rule ·
  average lead response time by industry · how to respond to leads faster
  without hiring · text vs call for lead follow-up.
- **No-Show Cost Calculator**: how to reduce no-shows at a [med spa/salon/dental] ·
  appointment reminder templates · should you charge a no-show fee ·
  average no-show rate by industry · SMS vs email reminders.
- **AI Receptionist Script Generator**: how to write an AI receptionist script ·
  what should an AI receptionist say · AI receptionist vs answering service ·
  after-hours call handling for small business · sample phone scripts for [trade].
- **Service Business FAQ Generator**: FAQ page examples for [trade] · how many
  FAQs should a website have · how to write a service-business FAQ.
- **Booking Friction Grader**: how to let customers book online · online booking
  best practices · how many clicks to book · reduce booking abandonment.
- **AI Visibility Checker**: what is GEO / answer-engine optimization · how to get
  your business recommended by ChatGPT · how to show up in AI search ·
  local SEO vs GEO.

→ ~5–8 × 6 tools = **30–48 articles** in the first real batch.

## 3. Part 2 — The weekly article loop

Infra is ~80% there: cron armed (`~/agents/run-agent.sh`, `IS_SANDBOX=1`),
DataForSEO on the box (`DATAFORSEO_AUTH_B64`), autonomous PR→merge working
(gh token, account `fixlyai`). New dependency: **`RESEND_API_KEY`** stored like
`DATAFORSEO_AUTH_B64` (chmod-600 `.env.local`), email to
maximehoule100@gmail.com.

### 3.1 Loop stages (cron, weekly)
1. **Research** — DataForSEO sweeps target patterns (`how to…`, `how do I…`,
   `best X for Y`, `alternative to…`, `why…`), scores by volume × intent ×
   attainable difficulty, dedupes against everything live. Produce ~100 candidates.
2. **Plan/cluster** — group into pillar clusters, cap per-topic (no 40
   near-duplicates), rank the week's shortlist.
3. **Draft** — generate each article into the registry format, grounded + cited.
4. **Quality gate** — adversarial fact-check + quality-score pass (maker≠checker).
   Drop anything that can't cite its claims or scores below threshold.
5. **Publish** — merge the survivors (see §6 for the auto-publish decision),
   IndexNow ping.
6. **Digest email (Resend)** — weekly summary: what published, target keyword,
   volume, intent, cluster, live URL, and a one-click **revert** link (PR) for
   anything Max wants pulled.

### 3.2 Cadence
Research ~100 candidates/week; **publish 10–20/week to start**, scale only as
indexation + rankings confirm quality is landing (Search Console). Raise the
throttle on data, not vibes.

## 4. Architecture (the crux)

**Data-driven article registry**, mirroring `best-pages.ts`:
- `articles.ts` — each article an object:
  `{ slug, title, targetKeyword, intent, cluster, relatedTool, relatedBest,
     sections: [{h2, body}], faq: [{q,a}], sources: [{label,url}], updated }`.
- One server template renders HTML; a markdown twin renders `/blog/<slug>.md`
  (or `/guides/<slug>.md`). Registration auto-derives sitemap + llms.txt.
- `Article` + `FAQPage` JSON-LD, the Maxime-Houle E-E-A-T byline, IndexNow ping.
- `articles.spec.ts` enforces invariants: unique slugs, ≥1 source per article,
  no fabricated-stat patterns, every `relatedTool`/`relatedBest` resolves,
  markdown renders without `undefined`/`null` leak.

## 5. Guardrails (STRICTER because auto-publish was chosen — §6)

Auto-publish means the quality gate is the ONLY thing between us and Google's
**scaled-content-abuse** spam policy (a domain-level demotion risk). So:
- **Strict quality gate**: adversarial cite-check + quality score; hard floor,
  drop-not-ship. No article merges without ≥N cited claims and a passing score.
- **Per-week cap** enforced in code (start 20) regardless of candidate count.
- **Dedupe** vs sitemap every run; never two pages per intent.
- **Circuit breaker**: if a week's average quality score drops below a floor, or
  the drop rate spikes, the loop PAUSES and emails Max instead of publishing.
- **Post-publish digest with one-click revert** (the email is the safety valve,
  since there's no pre-merge gate).
- **Search Console monitoring**: watch impressions/indexation for demotion; if
  the domain trend turns down, throttle to 0 and review.

## 6. Decisions (settled 2026-07-09)

- **Publish model: AUTO-PUBLISH, notify after.** (Max chose this over the
  human-approve gate.) Mitigation = the strict quality gate + circuit breaker +
  revert digest in §5. Revisit if Search Console shows domain-level softness.
- **Cadence: 10–20/week to start**, scale on proven indexation.
- **Plan doc lives here**; memory pointer added.

## 7. Phased rollout

- **Phase 1 (build now):** article registry + template + `.md` twin + JSON-LD +
  byline + IndexNow + spec test. Prove it with ONE full tool cluster (~6–8
  articles, DataForSEO-selected, verified, PR'd, merged, live).
- **Phase 2:** the weekly cron loop + DataForSEO research + quality gate +
  Resend digest, launched at 10–20/week with the §5 guardrails.
- **Phase 3:** scale cadence on Search Console data; expand patterns
  (`vs`, `pricing`, `for [vertical]`).

## 8. Open items before Phase 2

- Add `RESEND_API_KEY` to the box (`.env.local`, chmod 600).
- Confirm URL namespace for articles: `/blog/<slug>` (exists) vs a new
  `/guides/<slug>`. Recommend `/guides` to separate evergreen SEO articles from
  the narrative blog.
- Define the quality-score rubric + floor (cite density, originality, intent
  match, readability) in the gate agent.
