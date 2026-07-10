# The Wedge to $1M ARR — first-principles reflection (2026-07-07)

Status: PROPOSAL (cofounder recommendation, not yet Max-approved). This
deliberately re-examines pricing/positioning lines that CLAUDE.md §1b marks
"settled" — Max asked for the re-examination explicitly on 2026-07-07.

---

## ⭐ UPDATE 2026-07-08 — what changed in the 24h since this was written

Two of the four open questions moved from proposal to shipped reality:

**Pricing SHIPPED (decision point #2 effectively answered).** The live ladder
(flags flipped, Stripe prices set, checkout verified):

| SKU | Price | Maps to this doc's proposal |
|---|---|---|
| Builder | **$29/mo flat**, unlimited workspaces, BYOK | the self-serve top-of-funnel (§4 "keep $29") |
| Managed workspace | **$49/mo** | the per-client wholesale unit (§4's "$49/client") |
| Agency | **$99 / $199 / $299/mo** by sub-account count | §4's "$297 agency tier", now laddered so a 2-client agency starts at $99 instead of bouncing off $297 |

Grandfathered legacy plans frozen. No GMV tax on agency retainers — "we don't
tax your work" intact. The wedge's pricing shape survived contact with
implementation nearly unchanged; the only delta is the agency ladder's lower
on-ramp, which strictly improves the §6 rung-4 design-partner motion.

> **DECIDED 2026-07-10 (Max):** the no-agency-GMV position above is now the
> shipped fee structure — flat **2% GMV on solo tiers ($29/$49) only when SF
> is the sales channel · 0% on agency tiers ($99+)** · marketplace 5%
> unchanged · the 5→3→2 declining ladder retired. The 2% doubles as the
> upgrade escalator: crossover ≈ **$3.5k/mo GMV** (2% × $3.5k = $70 = the
> $29→$99 gap), i.e. the fee self-liquidates into agency-tier MRR right when
> a builder becomes an agency. Decided before SF_AUTOPAY_CONSOLE flipped, so
> no customer ever experiences an agency-side fee.

**Distribution went from "no distribution asset" (§3 path A's fatal flaw) to a
running machine.** Built and LIVE as of tonight — the five-channel system:

1. **SEO/GEO engine (~460 pages, indexing now):** 25 `/compare/seldonframe-vs-X`
   + 30 third-party pairs + 25 `/alternative-to-X` + **25 `/[competitor]-pricing`
   pages** + 37 `/best/<tool>-for-<niche>` listicles + 11 free tools (5 pricing
   calculators with shareable YouTube-thumbnail result cards). Every page:
   TL;DR box, front-office flow diagram, grade-6 copy, sources rows, FAQ/ItemList
   JSON-LD, OG thumbnail cards, `.md` twins + `llms.txt` for LLM citation (GEO).
   Submitted to GSC + Bing (333 URLs); **IndexNow** pushes changes to
   Bing/Copilot/DDG in minutes; monthly price-refresh + weekly keyword-recon
   agents keep it accurate and growing (never-lies, enforced by cron).
2. **YouTube keyword videos:** every `/best` page has a live `videoId` seam
   (lite-embed + VideoObject schema); the `/youtube-video-kit <slug>` skill
   produces script (from the page's exact facts), thumbnail (the OG endpoint IS
   a thumbnail generator), titles/description/chapters/pinned comment. Max
   records ~10 min of face per video; page and video boost each other.
3. **Reddit answer engine:** `reddit-recon` agent (Tue+Fri) finds live threads
   ("best CRM small business reddit", "GHL alternative reddit"…) and drafts
   honest, disclosed answers. HARD RULE: Max posts by hand; never automated.
   Why: Google now ranks Reddit threads for nearly every "best X for Y" query.
4. **IG Reels + YT Shorts — repurpose only:** each video kit includes 3 clip
   specs (hook line, cut points, vertical captions). No native short-form
   production; B2B intent doesn't justify it. Post-processing is agent work.
5. **X build-in-public:** the `/x-post-engine` skill mines each work session
   into 2-3 drafts across the 6 founder-content formats (build log · scar ·
   value post · receipt · contrast hook · milestone), keyword-first so posts
   rank in Google SERPs next to our pages. The receipt series (monthly GSC/Bing
   graphs) is the compounding anchor. Angle call stays with Max — only
   non-delegable step.

**The activation wall also got its designed fix turned on:**
`SF_WEB_UNGATED_BUILD=1` is now LIVE — paste-a-URL → built workspace with no
signup, and the **BuildWidget on every comparison/pricing/best page** feeds it.
The §1 funnel (22 signups → 0 paying) predates both this and all traffic; it
must be re-measured weekly from now (visit → built → tested agent → claimed →
paid).

**Infrastructure:** all recurring distribution work now runs 24/7 on a €7/mo
Hetzner devbox (Tailscale-only, machine-user git identity that GitHub's
`protect-main` ruleset genuinely blocks from main — tested), independent of
Max's laptop. Runbook: `docs/ops/hetzner-devbox.md`.

**Sequencing consequence for §6:** the ladder gains a rung between #2 and #4 —
after the first closes exist, run the **listing blitz** (Show HN "open-source
GoHighLevel alternative" + Product Hunt + AlternativeTo/OpenAlternative +
G2/Capterra seeded with review asks from the 10 hand-closed customers).
Directories and review sites are what LLMs cite → the GEO channel compounds it.

Remaining open decisions: #1 (wedge positioning), #3 (10-close proof sprint —
now the single highest-leverage founder action), #4 (freeze list). See §7.

---

## 1. The honest diagnosis: SeldonFrame is five businesses

What www.seldonframe.com sells today, simultaneously:
1. Instant business-OS for SMB operators (site + CRM + booking + intake, $29 flat)
2. An agent-builder platform for developers (build from your IDE via MCP, BYOK)
3. A two-sided agent marketplace (build → sell → get paid, 5%/2% fees)
4. A vertical AI receptionist (voice + missed-call text-back + reviews)
5. A whitelabel platform for agencies (portal, multi-deploy, custom domains)

The evidence says none of them is converting as a self-serve motion: the true
external funnel (2026-07-03 audit) was **~22 signups → 2 built → 0 active → 0
paying**. Revenue to date: $0 external. Meanwhile the ONE motion that has
produced a real end-to-end charge is the **live-sell agency close** (`/start`
embedded checkout, confirmed with a real payment 2026-06-16, sold by Seldon
Studio on a Zoom call).

First principle: a startup at $0 revenue does not have a product problem or a
feature problem — it has a **distribution + focus problem**. Every additional
"thing" SeldonFrame is dilutes the only scarce resources (Max's time, the
landing page's one headline, the story a customer can repeat).

## 2. Work backwards from money (Bezos) — who already pays for this pain?

$1M ARR decomposed: `$1M / 12 / price = customers needed`.

| Price point | Customers | Who realistically pays it |
|---|---|---|
| $29/mo | ~2,900 | prosumers/builders — needs mass self-serve distribution |
| $299/mo | ~280 | SMBs with revenue-linked pain (missed calls = lost jobs) |
| ~$800–1,300/mo effective | ~70–100 | agencies reselling to 5–30 SMBs each |

Who has hair-on-fire pain AND an existing budget line?
- A **local service business** (HVAC, plumbing, roofing, med-spa) missing calls
  loses $300–$5,000 jobs. They ALREADY pay $200–500/mo for answering services,
  and $97–497/mo for GoHighLevel-class software. The AI receptionist category
  is validated by a crowded field (Smith.ai, Goodcall, Rosie, Avoca…) — crowded
  is good at the wedge stage; it means budget exists.
- An **agency operator** (the "AI agency" wave) wants to sell exactly that to
  local businesses and needs a whitelabel stack they didn't have to build.
  GoHighLevel built ~$1B ARR on precisely this buyer. They pay $297–497/mo
  without blinking because ONE client covers it.
- A **developer/builder** pays $29 reluctantly, churns fast, and needs a
  marketplace with liquidity we don't have. A **marketplace** needs both sides
  at once — the classic cold-start we cannot brute-force solo.

## 3. Probability-weighted paths (18-month horizon, solo founder + agents)

| Path | P($1M ARR in 18mo) | Why |
|---|---|---|
| A. Self-serve $29 horizontal | ~3–5% | 0% activation so far; needs ~10⁵ visitors/mo; no distribution asset |
| B. Marketplace flywheel | ~2% | two-sided cold start; supply exists, demand doesn't |
| C. Direct vertical AI receptionist ($299) | ~15–20% | product built, category validated; but 280 closes = a full-time sales job with no leverage |
| D. **Agency channel ($297 + $49/client)** | **~30–35%** | 1 sale = 5–30 seats; whitelabel infra ALREADY BUILT; buyer actively shopping; GHL playbook proves the motion |
| E. Seldon Studio as pure services agency | high P of revenue, but it's not platform ARR | proof engine, not the business |

Path D is the surest wedge, **with C as its proof engine** (E folded in). They
are not two strategies — they are one pipeline: Seldon Studio closes local
businesses directly to prove the offer, generate case studies and the ROI
numbers, then we sell **that exact playbook + stack** to agencies.

## 4. The wedge, stated as one sentence

> **SeldonFrame is the whitelabel AI front office for local service businesses
> — an AI receptionist that answers, qualifies, and books real jobs into a real
> CRM — sold through agencies who run it under their own brand.**

- **ICP (primary):** agency operators (marketing agencies, "AI agencies",
  MSP-adjacent consultants) with 2+ local-business clients, US/CA. They already
  sell websites/ads to plumbers and dentists; we hand them the AI upsell.
- **ICP (proof motion, run by Seldon Studio):** home-services + med-aesthetics
  owners, 1–10 staff, US, currently missing calls. The 9 demo verticals we
  already built ARE this list.
- **The offer (agency):** $297/mo — whitelabel platform, agency portal, deploy
  the receptionist+site+CRM bundle to clients in one click, 3 client workspaces
  included, **$49/client/mo after** (wholesale; they resell at $300–800). BYOK +
  BYO-Twilio keeps our COGS ≈ 0 and their margin fat. **No GMV tax** — "we
  don't tax your work" survives intact and is the anti-GoHighLevel positioning.
  *[2026-07-08: SHIPPED as the Agency ladder $99/$199/$299 by sub-account count
  + $49/mo managed workspaces — same shape, lower on-ramp. See the UPDATE block
  at the top.]*
- **The offer (direct/proof):** $299/mo per location, sold live on a Zoom via
  `/start` (already built). Anchor: "one booked job pays for it."
- **Keep $29 self-serve as top-of-funnel**, not as the business: free
  build→claim stays the magic demo and the lead-gen for both motions.

Why this wins on first principles: our differentiated asset is not "an agent" —
everyone has an agent. It is the **fused, natively-integrated front office**
(voice+SMS+booking+CRM+site with no Zapier chain), which is exactly what makes
never-lies reliability POSSIBLE (deterministic tool bridge, read-back, evals)
and exactly what an agency cannot assemble from parts. Musk's "the best part is
no part": the moat is the deleted integration layer.

## 5. What we deliberately STOP feeding (freeze, don't delete)

- Marketplace growth work (keep it live; it becomes valuable AFTER there are
  hundreds of agencies who want to trade playbooks — sequence, don't abandon).
- x402/AP2/ACP payment rails (inert, Max-gated — leave parked).
- ChatGPT-app — already built; let it compound passively. *[2026-07-08: the
  SEO/GEO engine moved OFF this list — it's no longer passive; it's the active
  five-channel distribution machine (see UPDATE block), maintained by cron
  agents at ~2 founder-hours/week (record videos, pick post angles, hand-post
  Reddit). That founder time-box is the constraint that keeps it off the
  freeze list without violating its spirit.]*
- New surfaces of any kind until the wedge has 10 paying logos.

The builder/IDE story doesn't die: **agencies ARE builders.** "Build an agent,
sell it, get paid" becomes the agency pitch, not a separate audience.

## 6. 90-day execution ladder (each rung gates the next)

1. **Clear A2P-10DLC** (known fix: standardize every Twilio field on
   seldonstudio.com) — SMS text-back is half the receptionist's value.
2. **Seldon Studio closes 10 paying locals at $299** using the live-sell flow.
   Deliverable: 3 case studies with hard numbers.
3. **Ship the ROI counter** on the operator dashboard: calls answered, jobs
   booked, $ recovered. This is the retention feature AND the sales asset —
   the product must prove its own ROI on screen every day.
4. **5 design-partner agencies** at founder pricing ($197 locked-for-life),
   hand-recruited, white-gloved with the Seldon Studio playbook. Success = each
   deploys ≥2 paying clients in 30 days.
5. **One headline per surface:** seldonframe.com/agencies = the agency story;
   seldonstudio.com = the direct SMB story; the root homepage keeps the free
   build as demo. Stop asking one page to sell five businesses.

Scenario math (not a promise): month 6 ≈ 10 agencies (avg 4 clients) + 30
direct ≈ $23k MRR ≈ $280k ARR run-rate; month 12–18 with 60–80 mature agencies
crosses $1M. Every assumption above is checkable monthly; if agencies don't
attach ≥2 clients in 30 days, the wedge premise is wrong — revisit, don't push.

## 7. Explicit decision points for Max — status as of 2026-07-08

1. **OPEN — Adopt the wedge sentence in §4 as THE positioning** (updates
   CLAUDE.md §1b)? Everything downstream (video topics, /agencies headline,
   listing-blitz copy) keys off this one sentence.
2. ~~Approve the $297 agency tier + $49/client wholesale?~~ **ANSWERED BY
   SHIPPING (2026-07-08):** Builder $29 · Managed $49 · Agency $99/$199/$299 by
   sub-account count — live in Stripe, checkout verified. The wedge's economics
   hold with a lower agency on-ramp.
3. **OPEN — and now the single highest-leverage founder action:** commit Seldon
   Studio to the 10-close proof sprint as priority #1? Distribution machinery is
   running on agents; hand-closing is the one motion agents can't do. The 10
   closes also unblock the listing blitz (G2 needs reviews to matter).
4. **OPEN — Freeze list in §5** (as amended: SEO/GEO engine is out of the
   freeze, time-boxed at ~2 founder-hours/week) — confirm nothing on it is
   secretly load-bearing to you?

New since the proposal, requiring no decision (already running): the weekly
funnel report on the now-live ungated build (visit → built → tested → claimed →
paid) is the scoreboard for everything above; if agencies or SMBs stall at a
step, that step is the next build priority — nothing else is.
