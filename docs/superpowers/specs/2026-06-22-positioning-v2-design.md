# SeldonFrame Positioning v2 — "Your entire service business, live in 60 seconds" — Design

**Status:** Brainstormed + approved by Max (2026-06-22). Source of truth for the seldonframe.com rewrite. Copy/positioning spec — not an engineering spec.

## The problem we're fixing
seldonframe.com confuses because it answers **two buyers' searches at once** (an SMB running a business *vs* an agency building to sell) and stacks **five concepts in the hero** (front office · build-and-sell · multi-surface · flat pricing · GMV). A visitor holds **one** idea in ~5 seconds, so they can't answer the only question that matters — *"is this for me, and what is it?"* — and they bounce. The recent rewrite made it worse by layering the platform/GMV story on top. **Confusion is the enemy of sales.** The fix is a decision, not better words: one buyer, one transformation, one idea per section.

## What SeldonFrame IS (one sentence)
> **The all-in-one platform to run *and sell* your service business — a website, booking, CRM, and AI agents that do the work — built from your URL in 60 seconds.**

**Internal spine (NEVER consumer copy):** "Shopify for service & agent businesses." A plumber doesn't know what Shopify is — he knows he's drowning in missed calls. The Shopify frame guides *our* thinking and investor narrative only.

---

## The four clarity answers

### 1. Offer & transformation
- **Core offer:** paste a URL → a complete AI front office (multi-page **website + booking page + intake form + CRM**) builds in 60s; then add **no-code AI agents** (from templates/marketplace, or build your own) to **answer every call, request reviews, and handle DMs + email**.
- **Transformation:** from *drowning in missed calls + duct-taped tools* → *a business that runs and sells itself, 24/7, in one place.*
- **Features → benefits:** website → look legit / get found, no web project · booking + intake → customers book themselves, pre-qualified leads · CRM → every lead & job in one place, not a spreadsheet · AI agents → the work an employee or agency would do, for pennies, 24/7 · marketplace → install a proven agent instead of hiring (or build & sell your own) · $29 flat + BYOK → no metered bill, you own + export everything.

### 2. Audience (ONE)
- **Primary:** the **service-business owner** (plumber, esthetician, massotherapist, coach, contractor, clinic) who **already uses AI** (ChatGPT/Claude/Gemini) and is tired of missing leads + juggling tools.
- The **"agency/builder" is NOT a second audience** — it's the **top rung of the same ladder**: a power-user SMB whose *product* is agents, reselling to other businesses. One page, one ladder, revealed by scroll.
- **Why BYOK fits this buyer:** they already have an AI account → the key is a **fit-signal, not a barrier.**

### 3. Value & differentiation (the three pillars)
- **Never lies** — grounded in the real business; books into the real calendar; deterministic read-back; never invents prices; auto-evals. (Reliability is the moat; voice quality is commoditized.)
- **Never taxes you** — **$29/mo flat, unlimited workspaces**; agents run on **your** AI key at cost (we never mark up usage); **+~2% GMV only on what you sell *through* SeldonFrame** (sell outside → we take nothing); own + export everything.
- **Never goes stale** — thin harness rides every AI model improvement for free.
- **vs the alternatives:** vs **hiring** (an employee/agency costs $$$; an agent is pennies + 24/7) · vs **GHL/Frankenstein** (60s, one connected system, no Zapier) · vs **point AI tools** (this is the *whole* front office + the marketplace).

### 4. Goal (single primary action)
- **Self-serve:** **"Start your 14-day free trial"** → paste URL → workspace builds (on our key) → add your AI key + agents to activate. Secondary CTA: explore the marketplace / "for builders."

---

## Pricing (CORRECTED — source of truth)
- **$29/mo FLAT · UNLIMITED workspaces · 14-day free trial.**
- The **first workspace builds on SeldonFrame's LLM key** (instant trial magic, no key needed to *see* it build); it **converts to $29/mo** when they add agents / a custom domain / etc., or the trial ends — and agents thereafter run on the customer's **own AI key (BYOK)**.
- **+ ~2% GMV ONLY on transactions processed through SeldonFrame** (payments, proposals, packages, agent-usage billing) — exactly Shopify's third-party-gateway fee. **Sell outside SeldonFrame → no fee.**
- **NOT free.** The current live *"first workspace free"* copy (hero + magic-first-run signup) is **WRONG** and must be corrected to **"14-day free trial, then $29/mo."** This is the #1 implementation item.
- **Why a flat $29 monetizes self-use:** the SMB runs the workspace *and* runs agents for their own use (we can't take a cut) *and* may sell their service outside SF (no GMV) → the flat $29 is the floor, and it's absurd value. The GMV is upside that only triggers when SF is the rail.
- **⚠️ Backend gap:** the billing backend (`#139`) still charges the old $19/$49/$297 tiers. The marketing now leads billing; **`#139` must be reconciled to $29-flat + GMV before any real paid signup.** (Out of scope for this rewrite; tracked as the paired follow-up.)

## The marketplace flywheel (the distribution engine)
- **Demand** = the $29 SMBs. Instead of **hiring an agency or an employee**, they **install an agent** from the marketplace to do a job (24/7 receptionist, review-getter, no-show-reducer).
- **Supply** = builders. **Build an agent once → the marketplace puts it in front of thousands of SMBs → earn without marketing it.** Distribution is the marketplace, not an ad budget = **built-in virality.**
- **Flywheel:** more SMBs → more agent demand → more builders → better/cheaper agents → more SMB value → more SMBs.
- The page must seed **both hooks**: *install* (demand) and *build & sell* (supply).
- **Truthfulness guardrail:** templates + "build your own (no-code)" are **live** (the starter pack) — lead with those as real. The **public 3rd-party marketplace with revenue-share is a near-term direction**, not a shipped storefront — frame it as "growing / templates today, full marketplace coming," never a fake live listing grid. (No-placeholders rule.)

---

## The page: one ladder, one idea per section

| # | Section | The one idea | Audience rung |
|---|---------|--------------|---------------|
| — | **Hero + 60s build demo** | "Your whole business — site, booking, intake, CRM — built and answering in 60 seconds." | everyone |
| 1 | **Run** | The front office that runs your business: website + booking + intake + CRM + a receptionist that *books the job* — never miss a lead. | every SMB |
| 2 | **Sell** | Take payments, send proposals, sell packages right through it. *(+2% only on SF sales — "we don't tax your work")* | growing SMB |
| 3 | **Hire agents, not people** | Install no-code AI agents (templates today) to do the work — answer calls, get reviews, handle DMs + email — cheaper than an agency or a hire. | demand side |
| 4 | **Build & sell agents** | Build an agent once; the marketplace sells it to thousands of SMBs for you. *(this is where "agencies" live)* | supply side / builders |
| — | **Pricing · proof · FAQ · CTA** | $29/mo flat, unlimited, 14-day trial, +2% only on what you sell through us. | closers |

Everything currently fighting in the hero (multi-surface, build-and-sell, GMV) gets a home **lower on the ladder** — present, not deleted, not competing. The cold plumber reads the hero + rungs 1–2 and converts; the ambitious one reads 3; the builder reads 4.

### Hero copy (locked: C headline + A subhead, refined)
> # Your entire service business, live in 60 seconds.
> Paste your URL and watch it build — a multi-page **website, booking page, intake form, and CRM**, wired together and ready for customers. Then add no-code AI agents — start from a template or build your own — to **answer every call, request reviews, and handle your DMs and email.** The busywork, done for you.
>
> **[ Start your 14-day free trial → ]**
> *then $29/mo · works with your ChatGPT, Claude, or Gemini key — we show you how*

*(Hero says "template or build your own" — both live today — to stay strictly true; the **marketplace** concept is introduced at rungs 3–4 framed as "growing," never as a fake live storefront.)*

### The LLM key — a qualifier, not a barrier
1. **Fit signal:** *"Already use ChatGPT, Claude, or Gemini? You're ready. Connect your key in 30 seconds — we show you exactly how."*
2. **The reason the price is honest:** *"Your agents run on your own AI key, billed by the provider at cost — pennies. We never mark it up. That's why it's a flat $29, not a metered bill that punishes growth."*
3. **Timed right:** the website/booking/intake/CRM **build with no key** (on us, during the trial). The key is requested only when they switch an **agent** on — the moment they understand why. Add a one-line **"what you need"** beat (*a URL, and an AI key you probably already have*) + a short FAQ entry. No scary upfront gate.

## What changes on the site (demote / correct, don't delete)
- **Hero:** replace the current stacked hero with the locked C+A hero above.
- **Correct the pricing copy everywhere:** *"first workspace free"* → *"14-day free trial, then $29/mo · unlimited workspaces"* (hero proof-line, pricing section, FAQ, final CTA, metadata, AND the magic-first-run signup copy `connect-ai` + the "Skip — start free" line).
- **Re-sequence sections** into the ladder; ensure one idea per section.
- **GMV:** moves from any hero mention to the **Sell** rung + pricing ("2% only on what you sell through us").
- **LLM-key:** add the qualifier framing + "what you need" beat + FAQ; keep it out of the hero except the one trust-line.
- Keep the design system (palette `#F6F2EA/#221D17/#00897B/#1F2B24`, Hanken/Newsreader), all hrefs/anchors, component APIs. FAQ `FAQS` const drives JSON-LD — edit the const.

## Non-goals (out of scope for this rewrite)
- The billing **backend** (`#139`) — separate; must reconcile to $29-flat+GMV before real paid signups.
- Building the **marketplace** itself — positioning references it honestly (templates today); the storefront + revenue-share is a separate build.
- Product/feature changes — copy + section structure + the pricing-copy correction only.

## Success criteria
- A cold visitor answers *"what is it / is it for me"* in **5 seconds**.
- **One idea per section**; hero has **one** promise + **one** CTA.
- BYOK reads as a **qualifier**; pricing is **$29 flat + GMV**, with **no "free"** anywhere.
- Both flywheel hooks (install / build-&-sell) are present, in ladder order, without re-cluttering the hero.
