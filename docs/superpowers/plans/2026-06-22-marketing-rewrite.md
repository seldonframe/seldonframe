# Marketing Rewrite — New Positioning + $29-Flat + GMV Pricing — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. This is a **copy/JSX rewrite** (no logic) — keep all `href`s, anchor ids, component props, colors, and fonts intact.

**Goal:** Rewrite seldonframe.com copy to the finalized model: **never-lies / never-taxes / never-goes-stale**, the **build-and-sell-any-agent platform + complete AI front office**, and **$29/mo flat · unlimited workspaces · first workspace free · + GMV ("we don't tax your work")** — replacing the $19/$49/$297 tiers + the $99 voice add-on framing. BYOK demoted to plumbing (the magic first-run leads).

**Architecture (from recon):** Copy is inline in `packages/crm/src/components/landing/marketing-*.tsx` (const arrays) + `(public)/page.tsx` metadata + `(marketing)/pricing-public/page.tsx`. Tailwind, locked palette (`#F6F2EA` paper / `#221D17` ink / `#00897B` green / `#1F2B24` dark), fonts (Hanken Grotesk / Newsreader). The FAQ JSON-LD auto-generates from the `FAQS` const — keep it in sync by editing the const.

**Conventions:** tsc `packages/crm/node_modules/.bin/tsc -p packages/crm/tsconfig.json --noEmit` (0 NEW; ~10 `.next/types` baseline); `bash scripts/check-use-server.sh src` clean; `pnpm -C packages/crm build` or the marketing route compiles; keep `"use client"` where present. No tests (copy). Commit per section group.

## THE MODEL (source of truth for all copy)
- **Offer:** SeldonFrame is the AI-native platform to **build, run, and sell AI agents + complete front offices**. SMBs get a whole front office (website + booking + CRM + intake + a 24/7 AI agent across **voice · chat · SMS · email**), live in 60 seconds, **first one free**. Builders/agencies **build any agent in the Studio, deploy it to clients as a whitelabel front office, and resell it.**
- **Three pillars (the spine — use throughout):**
  - **Never lies** — grounded in your real business; never double-books; reads back before booking; never invents a price.
  - **Never taxes your work** — **$29/mo flat**, unlimited workspaces, no metered surprises, you **own + export** everything.
  - **Never goes stale** — built on a thin harness that **rides every AI model improvement** — your agents get smarter for free.
- **Pricing (replaces the 3 tiers):**
  - **$29/mo flat · unlimited workspaces · 14-day free trial · first workspace free.**
  - **+ GMV fee** — 5% → 3% over $10k/mo → 2% over $50k/mo, **only when SeldonFrame is your sales channel** (marketplace/booking/proposals). Headline: **"We only make money when you do — we don't tax your work."**
  - **Why it's flat:** BYOK + BYO-Twilio under the hood — you pay the AI + telephony providers directly at cost, we don't mark up your usage. The voice receptionist is **included** (not a $99 add-on).
- **vs GoHighLevel:** $29 flat vs $497; 60s vs 2–4 weeks; one connected system, no Zapier glue; multi-surface agents; never-lies reliability; you own it (AGPL/exportable).
- **BYOK = plumbing:** "Your **first workspace is free** — no key to babysit. Add your own AI key when you're ready to *run* agents + spin up client workspaces." (NOT a front-door ask.)

---

## Task 1: Hero + proof strip + metadata
**Files:** `marketing-hero.tsx`, `marketing-proof-strip.tsx`, `(public)/page.tsx` (metadata/OG).
- [ ] Hero headline → lead on the platform + the magic ("Build, run & sell AI agents — and a complete front office — live in 60 seconds. First one free."). Subhead = the front office + multi-surface + paste-and-go. Proof checklist → "First workspace free · Live in 60 seconds · $29/mo flat after · Cancel anytime". Eyebrow keeps the dual SMB/agency framing. Update `(public)/page.tsx` `<title>`/description/OG/Twitter to the new line + "$29/mo flat".
- [ ] Proof strip: keep the "edit by chatting / no code" reassurance; swap any price mention to "$29/mo flat — no surprise fees". **Commit** `feat(marketing): hero + proof + metadata → platform offer + $29 flat`.

## Task 2: Pricing section (the big restructure)
**Files:** `marketing-pricing-section.tsx`, `(marketing)/pricing-public/page.tsx`.
- [ ] Replace the 3-tier `TIERS` table with the **flat model**: one primary card — **"$29/mo flat · unlimited workspaces · first workspace free · 14-day trial"** + the **feature list** (everything included: website, booking, CRM, intake, web chat, **voice + SMS + email AI agents**, whitelabel, resell, your domain). Then a clear **"+ GMV — we don't tax your work"** block (5→3→2%, only when SF is the sales channel). Drop the "$99 voice add-on" (voice is included; usage is BYO-passthrough). Section heading → "One flat price. We only make money when you do." Keep the feature-matrix component shape but collapse to "included / how it works" (no per-tier columns) — adapt cleanly to the design system.
- [ ] `pricing-public/page.tsx` hero + metadata → the flat model. **Commit** `feat(marketing): pricing → $29 flat + GMV (we don't tax your work)`.

## Task 3: How-it-works + modules + SMB CTA
**Files:** `marketing-build-steps.tsx`, `marketing-modules.tsx`, `marketing-smb-cta.tsx`.
- [ ] Build steps: keep the 3-step paste→build→hand-over flow; add a line that the agent answers across **voice/SMS/chat/email**. Modules: keep the 6 front-office cards; **strengthen the agents-library callout** → "Build ANY agent in the Studio — voice, chat, SMS, email — connect external tools (Postiz, and more), deploy to clients, resell. Starter pack included." SMB CTA: keep the rotating-industry headline; subhead → "First one free. $29/mo flat after." **Commit** `feat(marketing): how-it-works + modules + SMB CTA → multi-surface + build-any-agent`.

## Task 4: Agency section + final CTA + FAQ
**Files:** `marketing-agency-math.tsx`, `marketing-final-cta.tsx`, `marketing-faq-section.tsx`.
- [ ] Agency math: replace the "$297/mo to SF" model → **"$29/mo flat + a small GMV fee only when we're your sales channel — you keep the rest."** Update the calculator labels/results (gross margin "after $29/mo + GMV to SF"). Final CTA: footer line → "First workspace free · $29/mo flat · Cancel anytime · Your data exports as JSON". 
- [ ] FAQ (`FAQS` const — JSON-LD auto-syncs): rewrite the pricing/white-label/usage/BYOK Qs. **Q "bring your own key?"** → "Your **first workspace is free** — no key needed to see it build. To *run* your agents and add client workspaces you add your own AI key (and Twilio for calls/texts) — that's why it's flat $29 with no usage markup: you pay providers at cost, we don't tax your work." **Q "how many workspaces?"** → "$29/mo flat, **unlimited** workspaces, first one free." **Q "usage fees?"** → "No metered markup. Flat $29 + a GMV fee only when SeldonFrame is your sales channel." Keep the GHL comparison ($29 vs $497). **Commit** `feat(marketing): agency math + final CTA + FAQ → flat $29 + GMV`.

## Task 5: Verify
- [ ] `tsc` 0 new; `check-use-server` clean; the marketing route compiles (`pnpm -C packages/crm build` for the `(public)`/`(marketing)` segments, or a targeted typecheck). Grep the marketing dir for any stale `$19`/`$49`/`$297`/`$99`/`$497`-as-our-price / "managed AI included" / "BYOK only for self-hosted" → none remain (except the GHL `$497` comparison).
- [ ] **Report:** the sections rewritten, that no stale price survives (grep), the regression statement (only copy changed — hrefs/anchors/components/colors/fonts intact; FAQ JSON-LD regenerates from the const), and the honest gap — **the billing backend still charges the old tiers (`#139`); this is the marketing-leads-billing window the user accepted; the backend reconcile to $29-flat+GMV is the paired follow-up.**

## Self-Review
- Coverage: positioning pillars + platform offer (T1/T3) ✓; $29-flat + GMV pricing (T2/T4) ✓; multi-surface + build-any-agent (T3) ✓; BYOK→plumbing + magic-first-run (T1/T4 FAQ) ✓; no stale prices (T5 grep) ✓.
- Constraints honored: hrefs/anchors/component APIs/colors/fonts untouched; FAQ const drives JSON-LD.
