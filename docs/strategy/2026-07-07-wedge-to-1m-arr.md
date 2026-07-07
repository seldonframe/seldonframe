# The Wedge to $1M ARR — first-principles reflection (2026-07-07)

Status: PROPOSAL (cofounder recommendation, not yet Max-approved). This
deliberately re-examines pricing/positioning lines that CLAUDE.md §1b marks
"settled" — Max asked for the re-examination explicitly on 2026-07-07.

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
- ChatGPT-app + SEO/GEO pages — already built; let them compound passively.
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

## 7. Explicit decision points for Max

1. Adopt the wedge sentence in §4 as THE positioning (updates CLAUDE.md §1b)?
2. Approve the $297 agency tier + $49/client wholesale (pricing change)?
3. Commit Seldon Studio to the 10-close proof sprint as priority #1?
4. Freeze list in §5 — confirm nothing on it is secretly load-bearing to you?
