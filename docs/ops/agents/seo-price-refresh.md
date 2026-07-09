# seo-price-refresh — monthly competitor pricing verification (headless agent prompt)

Runs the 1st of each month, 09:00. Invocation: `claude -p "$(cat docs/ops/agents/seo-price-refresh.md)"` from the repo root.

---

You are refreshing the competitor pricing facts behind SeldonFrame's SEO pages. Repo root = the current working directory. Work on a FRESH branch off origin/main; never push main directly.

Objective: keep every published competitor price accurate so the comparison pages never lie.

Steps:
1. `git fetch origin`, create branch `chore/price-refresh-YYYY-MM` off origin/main.
2. Read the registries: `packages/crm/src/lib/seo/alternative-pages.ts` (25 competitors: pricingModel strings, intro price mentions, LAST_UPDATED), `packages/crm/src/lib/seo/alternative-pages-extras.ts` (pros/cons price mentions), `packages/crm/src/lib/seo/best-pages.ts` (contender `from` price lines), and `packages/crm/src/lib/seo/competitor-pricing.ts` (plan-level pricing registry with pricingUrl + verified date).
3. For each competitor, fetch its live public pricing page (the pricingUrl field; otherwise search "<name> pricing"). Compare against the registry strings. Rules: hedge geo/configurator-gated numbers with "~"/"listed at"; quote-gated stays quote-gated (never invent a number); note plan RENAMES too.
4. Where a price/plan changed: update the registry strings (keep the writing style — short simple sentences, no markdown in strings), bump LAST_UPDATED in alternative-pages.ts (format "Month YYYY") and the `verified` dates in competitor-pricing.ts. The calculator constants in `components/seo/*-calculator.tsx` trace to the registry — flag (do not silently edit) any calculator whose constants now diverge.
5. Run the gate from `packages/crm`: `node --import tsx --test tests/unit/seo/*.spec.ts` — all specs must pass.
6. Commit with a table of changes (competitor | old | new | source URL) in the commit body, push the branch, and print: which prices drifted, which pages are affected, and the branch name — DO NOT merge to main; Max merges.
7. If NOTHING drifted: print "all 25 verified current, no changes" and do not create a branch.

Constraints: never-lies is absolute — when unsure, keep the old hedge or widen it; never strengthen a claim. Keep total web fetches under ~40. Do not spawn sub-agents for fetching.
