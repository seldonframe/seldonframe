# SeldonFrame Positioning v2 Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. This is a **copy/JSX + re-sequence rewrite** (no logic, no migration). Keep every `href`, anchor id, component prop, color hex, and font intact. No TDD (copy) — verification is tsc + check-use-server + stale-string greps + the marketing route compiling.

**Goal:** Make seldonframe.com answer "what is it / is it for me" in 5 seconds — restructure the homepage into the one-idea-per-section ladder, ship the new hero, and correct the live *"first workspace free"* copy to **"14-day free trial, then $29/mo · unlimited."**

**Architecture:** Re-sequence + re-theme the existing `marketing-*.tsx` sections into the ladder (Hero+demo → Run → Sell → Hire-agents-not-people → Build-&-sell → pricing/proof/FAQ), promote the agents callout into its own section, and fix the pricing/BYOK copy everywhere — including the magic-first-run signup `connect-ai` page. Copy is inline in TSX const arrays; the FAQ `FAQS` const drives JSON-LD.

**Tech Stack:** Next.js 16 / React 19, Tailwind. Conventions: tsc `packages/crm/node_modules/.bin/tsc -p packages/crm/tsconfig.json --noEmit` (0 NEW; ~10 `.next/types` baseline); `bash scripts/check-use-server.sh src` clean; keep `"use client"`. Locked palette `#F6F2EA`/`#221D17`/`#00897B`/`#1F2B24`; fonts Hanken Grotesk / Newsreader (serif italic accents). Spec: `docs/superpowers/specs/2026-06-22-positioning-v2-design.md`.

## Files (from recon)
- `packages/crm/src/components/landing/marketing-hero.tsx` — hero (Task 1)
- `packages/crm/src/components/landing/marketing-proof-strip.tsx` — proof band (Task 1)
- `packages/crm/src/app/(public)/page.tsx` — **section ORDER (the ladder)** + metadata (Task 2)
- `packages/crm/src/components/landing/marketing-build-steps.tsx` — the 60-second build demo (Task 2)
- `packages/crm/src/components/landing/marketing-modules.tsx` — Run rung (front office) + the agents callout to promote (Task 2)
- `packages/crm/src/components/landing/marketing-smb-cta.tsx` — repurpose as the **Sell** rung (Task 2)
- `packages/crm/src/components/landing/marketing-agency-math.tsx` — **Build-&-sell** rung (Task 2)
- `packages/crm/src/components/landing/marketing-pricing-section.tsx` + `app/(marketing)/pricing-public/page.tsx` — pricing (Task 3)
- `packages/crm/src/components/landing/marketing-faq-section.tsx` + `marketing-final-cta.tsx` — FAQ + close + LLM-key beat (Task 4)
- `packages/crm/src/app/(auth)/signup/connect-ai/page.tsx` — magic-first-run copy correction (Task 5)

---

## Task 1: Hero + proof strip + metadata

**Files:** Modify `marketing-hero.tsx`, `marketing-proof-strip.tsx`, `app/(public)/page.tsx` (metadata only).

- [ ] **Step 1 — Hero copy.** In `marketing-hero.tsx` set:
  - **H1:** `Your entire service business, live in 60 seconds.`
  - **Subhead:** `Paste your URL and watch it build — a multi-page website, booking page, intake form, and CRM, wired together and ready for customers. Then add no-code AI agents — start from a template or build your own — to answer every call, request reviews, and handle your DMs and email. The busywork, done for you.`
  - **Primary CTA:** `Start your 14-day free trial →` (keep the existing `/signup` href + the URL/paste input if present).
  - **Trust line under CTA (REPLACE any "free"/"$19" line):** `then $29/mo · unlimited workspaces · works with your ChatGPT, Claude, or Gemini key — we show you how`
  - Keep the eyebrow's dual SMB/builder hint but lead SMB.
- [ ] **Step 2 — Proof strip.** In `marketing-proof-strip.tsx` keep the "edit by chatting / no code" reassurance; ensure the chips read e.g. `14-day free trial` · `Live in 60 seconds` · `$29/mo flat after` · `Cancel anytime` — **no "free workspace" / "free forever".**
- [ ] **Step 3 — Metadata.** In `app/(public)/page.tsx` set title/description/OG/Twitter to the positioning one-liner: `SeldonFrame — the all-in-one platform to run and sell your service business: website, booking, CRM, payments, and AI agents that do the work, built from your URL in 60 seconds. 14-day free trial, then $29/mo.`
- [ ] **Step 4 — Verify + commit.** tsc 0 new; `check-use-server` clean. **Commit** `feat(marketing): positioning hero — '60-second service business' + 14-day-trial trust line`.

---

## Task 2: Re-sequence into the ladder + re-theme the rungs

**Files:** Modify `app/(public)/page.tsx` (the section order), `marketing-build-steps.tsx`, `marketing-modules.tsx`, `marketing-smb-cta.tsx`, `marketing-agency-math.tsx`.

- [ ] **Step 1 — Section order.** In `app/(public)/page.tsx` set the render order to the ladder:
  `MarketingNav → MarketingHero → MarketingBuildSteps (the 60s demo) → MarketingModules (Run) → MarketingSmbCta (Sell) → [Agents section — see Step 3] → MarketingAgencyMath (Build & sell) → LandingMarketingPricingSection → MarketingProofStrip → LandingMarketingFaqSection → MarketingFinalCta → MarketingFooter`. Keep all anchor ids valid (update nav links if an id moves).
- [ ] **Step 2 — Run rung (`marketing-modules.tsx`).** Section heading stays "your whole front office, wired together." Ensure the six cards read: **multi-page website · booking page · intake form · CRM · payments · a 24/7 AI receptionist that books the job.** Lead the section with the never-miss-a-lead idea (the receptionist that *books*, not just chats).
- [ ] **Step 3 — Promote the Agents callout into its own "Hire agents, not people" section.** The agents-library callout currently lives inside `marketing-modules.tsx`. Extract it into its own section block (a new `MarketingAgents` component in `marketing-modules.tsx` or a sibling file — match the existing section shape; keep `"use client"` if it animates) with:
  - **Heading:** `Hire agents, not people.`
  - **Body:** `Add no-code AI agents to do the work — answer every call, text back missed calls, request 5-star reviews, reply to DMs and email, win back cold leads. Start from a template or build your own in plain English. A 24/7 worker for pennies — not an employee or an agency.`
  - **Marketplace line (honest framing):** `A growing library of agents to install in one click — templates today, a full marketplace coming.`
  - Render this section at the ladder slot from Step 1.
- [ ] **Step 4 — Sell rung (`marketing-smb-cta.tsx`).** Repurpose this section to the **Sell** idea (keep the rotating-industry device if it fits): **Heading** `Get paid, right through it.` **Body** `Take payments, send proposals, and sell packages from the same place you run everything — no extra tools. We only charge ~2% on what you sell through SeldonFrame. Sell anywhere else? We take nothing. We don't tax your work.`
- [ ] **Step 5 — Build-&-sell rung (`marketing-agency-math.tsx`).** Re-theme to the supply-side / builder rung (this is where "agencies" live): **Heading** `Build an agent once. Sell it to thousands.` **Body** `Build an AI agent for your business — then list it so other businesses can install it. The marketplace puts it in front of them; you earn without marketing it. Run unlimited client workspaces under your brand for one flat $29/mo.` Update the calculator labels: the cost basis to SF is `$29/mo flat` (remove any `$297`); margin reads `after $29/mo + ~2% on SeldonFrame sales`.
- [ ] **Step 6 — Verify + commit.** tsc 0 new; `check-use-server` clean; nav anchors resolve. **Commit** `feat(marketing): re-sequence homepage into the one-idea-per-section ladder + promote agents section`.

---

## Task 3: Pricing — $29 flat unlimited + 14-day trial + GMV

**Files:** Modify `marketing-pricing-section.tsx`, `app/(marketing)/pricing-public/page.tsx`.

- [ ] **Step 1 — Pricing section.** Confirm the single flat card reads exactly: **`$29/mo flat · unlimited workspaces · 14-day free trial`**, everything-included list (website, booking, intake, CRM, payments, web chat, **voice + SMS + email AI agents**, your domain, whitelabel, resell). Then the **`+ ~2% — only on what you sell through SeldonFrame`** block with the line `We only make money when you do. We don't tax your work.` Heading: `One flat price. We only make money when you do.` **Remove any "first workspace free" / "free forever".**
- [ ] **Step 2 — Why-it's-flat line (BYOK as the reason).** Add one line near the price: `Your agents run on your own AI key, billed by the provider at cost. We never mark it up — that's why it's a flat $29, not a metered bill that punishes growth.`
- [ ] **Step 3 — pricing-public page.** Update `app/(marketing)/pricing-public/page.tsx` hero + metadata to the flat model + 14-day trial; remove stale `$19/$49/$297` and "free workspace".
- [ ] **Step 4 — Verify + commit.** tsc 0 new; `check-use-server` clean. **Commit** `feat(marketing): pricing → $29 flat · unlimited · 14-day trial · ~2% only on SF sales`.

---

## Task 4: FAQ + final CTA + the LLM-key "what you need" beat

**Files:** Modify `marketing-faq-section.tsx`, `marketing-final-cta.tsx` (and a short "what you need" block — add to `marketing-build-steps.tsx` or the hero area).

- [ ] **Step 1 — "What you need" beat.** Add one compact line near the build demo: `All you need: a URL, and an AI key you probably already have (ChatGPT, Claude, or Gemini). We show you how to connect it in 30 seconds.`
- [ ] **Step 2 — FAQ `FAQS` const** (JSON-LD auto-syncs — edit the const):
  - **"Do I need my own AI key?"** → `Yes — and if you use ChatGPT, Claude, or Gemini, you already have what you need. Your agents run on your own key (and Twilio for calls/texts), billed by the provider at cost. That's why it's a flat $29 with no usage markup — we don't tax your work. The website, booking, and CRM build with no key during your trial; you connect a key when you switch an agent on (we show you how).`
  - **"How much is it?"** → `$29/mo flat, unlimited workspaces, with a 14-day free trial. Plus ~2% only on what you sell through SeldonFrame (payments, proposals, packages) — sell anywhere else and we take nothing.`
  - **"Is the first workspace free?"** → `You get a 14-day free trial — we even build your first workspace on our AI key so you can see it work instantly. After that it's $29/mo flat for unlimited workspaces.` (replaces any "free forever" answer)
  - Keep the GHL comparison ($29 vs $497) and the "no Zapier" answer.
- [ ] **Step 3 — Final CTA.** `marketing-final-cta.tsx` footer line → `14-day free trial · then $29/mo · unlimited workspaces · cancel anytime · your data exports as JSON`. Headline stays the 60-second hook.
- [ ] **Step 4 — Verify + commit.** tsc 0 new; `check-use-server` clean. **Commit** `feat(marketing): FAQ + close + 'what you need' — BYOK-as-qualifier, 14-day trial`.

---

## Task 5: Correct the magic-first-run signup copy

**Files:** Modify `packages/crm/src/app/(auth)/signup/connect-ai/page.tsx`.

- [ ] **Step 1.** The page currently frames the first workspace as **free**. Re-word to the trial model — **do NOT change the skip logic** (keyless build on the platform key stays; only the copy changes):
  - Heading: `Connect your AI provider · optional`
  - Subhead: `Start your 14-day free trial — we'll build your first workspace on us so you can see it work. Add your own key when you're ready to run your agents (you probably already have one: ChatGPT, Claude, or Gemini).`
  - The secondary CTA label: `Skip — start my trial →` (was "Skip — start free").
  - Keep the "encrypted / SF can't read your keys" reassurance + the `skipConnectAiAction` wiring.
- [ ] **Step 2 — Verify + commit.** tsc 0 new; `check-use-server` clean. **Commit** `fix(signup): first-run copy → 14-day free trial (not "free workspace")`.

---

## Task 6: Verify

- [ ] `tsc` 0 new (10 `.next/types` baseline); `bash scripts/check-use-server.sh src` clean; **no migration**.
- [ ] **Stale-string grep — must be clean across `components/landing` + `app/(public)` + `app/(marketing)` + `app/(auth)/signup`:** no `first workspace free`, no `free forever`, no `$19`/`$49`/`$297`/`$99`-as-our-price (GHL `$497` comparison may stay). Paste the grep.
- [ ] Confirm the marketing + signup routes type-compile.
- [ ] **Report:** the new section order, the corrected pricing/BYOK copy, the stale-string grep result, the regression statement (copy/JSX + section order only — hrefs/anchors/components/colors/fonts intact; FAQ JSON-LD regenerates from the const; signup skip logic untouched), and the honest gap — the billing backend (`#139`) still charges old tiers (the accepted marketing-leads-billing window); live gate = read the page top-to-bottom as a cold plumber and confirm the 5-second clarity + a keyless trial build.

## Self-Review
- Spec coverage: hero C+A (T1) ✓; ladder re-sequence + rungs (T2) ✓; $29 flat/unlimited/trial + GMV (T3) ✓; BYOK-as-qualifier + "what you need" + FAQ (T1/T4) ✓; "free"→trial correction everywhere incl. signup (T1–T5) ✓; truthful marketplace framing (T2 Step 3) ✓; no migration/logic ✓.
- Constraints: palette/fonts/anchors/component APIs intact; FAQ const drives JSON-LD; signup skip logic unchanged.
- Deferred (non-goals, per spec): billing backend `#139`; the real marketplace storefront; product changes.
