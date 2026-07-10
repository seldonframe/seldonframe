# vendor-rate-refresh — quarterly supply-side vendor-rate verification (headless agent prompt)

Runs the 1st of each quarter (Jan/Apr/Jul/Oct), 09:30. Invocation: `claude -p "$(cat docs/ops/agents/vendor-rate-refresh.md)"` from the repo root. Sibling of `seo-price-refresh.md` (monthly, demand-side registries) — this one covers the vendor rates and platform-fee claims quoted inside the `sell-agents` guide cluster, which are all published with "as of this writing" hedges that rot.

---

You are refreshing the vendor-rate facts inside SeldonFrame's supply-side (`sell-agents` cluster) guides. Repo root = the current working directory. Work on a FRESH branch off origin/main; never push main directly.

Objective: every vendor rate, platform fee, and price anchor quoted in the sell-agents guides either matches the vendor's live page or gets re-hedged/updated — the builder-facing pages must never lie about someone else's pricing.

Steps:
1. `git fetch origin`, create branch `chore/vendor-rate-refresh-YYYY-QN` off origin/main.
2. Build the claim inventory: grep the sell-agents guides for dollar/percent claims —
   `grep -n "\$[0-9]\|% \|per minute\|per MTok\|/mo" packages/crm/src/lib/seo/guides/*.ts` filtered to guides whose `cluster` is `"sell-agents"` (list them via `guidesInCluster` in `packages/crm/src/lib/seo/guides/index.ts`). The known heavy files: `ai-marketplace-fees-compared.ts`, `voice-ai-reseller-programs.ts`, `white-label-ai-agents.ts`, `what-is-byok-ai.ts`, `how-much-to-charge-for-an-ai-agent.ts`, `ai-agent-statistics.ts`, plus the Ruby/Twilio anchors scattered across the build-and-sell guides.
3. Verify each claim against the vendor's own live page (the guide's `sources` array carries the URL). The canonical set as of 2026-07:
   - https://www.twilio.com/en-us/voice/pricing/us and /sms/pricing/us
   - https://www.ruby.com/pricing/
   - https://platform.claude.com/docs/en/about-claude/pricing
   - https://www.gohighlevel.com/pricing (incl. the AI Employee add-on)
   - https://stammer.ai/pricing · https://synthflow.ai/pricing · https://vapi.ai/pricing · https://www.retellai.com/pricing
   - Apple Small Business Program + Google Play service-fee pages (the fee anchors in ai-marketplace-fees-compared)
   - https://www.brightlocal.com/research/local-consumer-review-survey/ (survey-year figures)
   - Status-only checks (terms were "not publicly disclosed" at publish — confirm that's still true, or upgrade with a citation if they published): GPT Store payouts (use en.wikipedia.org/wiki/GPT_Store; openai.com 403s) · creator.poe.com · AWS Marketplace AI Agents · Salesforce AgentExchange.
4. Where a rate/fee/figure changed: update the guide prose (keep the writing style — plain paragraphs, hedges like "as of this writing" stay), and update the `sources` entry if the vendor moved the page. If a vendor page stops resolving, WIDEN the hedge (e.g. "previously published at…, page no longer public") — never keep a dead claim bare. If a previously-undisclosed program published terms, add the citation rather than paraphrasing from memory.
5. Also re-check the SF-side anchors those pages quote ($29/mo flat · GMV 5→3→2%) against `CLAUDE.md` §1b — if SF pricing changed, STOP and report loudly instead of editing (that's a Max decision, not a refresh).
6. Run the gate from `packages/crm`: `npx tsx --test tests/unit/seo/guides.spec.ts` — all green.
7. Commit with a table of changes (vendor | claim | old | new | source URL) in the commit body, push the branch, and print: which rates drifted, which guides are affected, and the branch name — DO NOT merge to main; Max merges.
8. If NOTHING drifted: print "all sell-agents vendor rates verified current, no changes" and do not create a branch.

Constraints: never-lies is absolute — when unsure, keep or widen the old hedge; never strengthen a claim. Known fetch blocks (don't burn budget): bls.gov, Upwork/Fiverr help pages, openai.com, gartner.com (403), mckinsey.com (timeouts). Keep total web fetches under ~30. Do not spawn sub-agents for fetching.
