# GHL pain research → SeldonFrame messaging-upgrade plan
2026-07-16 · deep-research run wf_255fe51e-463 (99 agents; 17 sources fetched; 70 claims extracted; 25 adversarially verified 3-vote → 23 confirmed, 2 refuted)

## The verified pain map (descending evidence strength)

### 1. Lock-in / no export — STRONGEST (vendor's own docs)
GHL's official support article states websites **cannot be exported** for outside editing/hosting: "HighLevel does not provide tools, guidance, or support for copying, hosting, or maintaining externally hosted HTML files." Sub-account migration off an agency's master account is agency-initiated only; white-label sub-accounts can't transfer at all; integrations/phone/email senders sever on transfer.
- Sources: help.gohighlevel.com article 155000007342 (updated Feb 2026); transfer docs 155000002031 / 155000003465; efficient.app
- **Phrasing guard:** say "no supported export" — never "zero data egress" (third-party scrapers exist).
- SF difference: GENUINE — AGPL open source, self-hostable, data exports as JSON.

### 2. Complexity / setup weeks — HIGHEST VOLUME
G2 AI-cons tally: Learning Curve 141 + Steep Learning Curve 90 + Not Intuitive 56 = 287 grouped mentions (dominant con). Capterra 4.2/5 with ease-of-use 3.7/5 (lowest sub-score); "SO SO SO complicated... For computer programmers, not for marketers." Implementation 2–4 weeks (3rd-party: 4–8 DIY), often with hired help.
- **Phrasing guards:** "implementations reviewers report take 2–4 weeks" (attributed). NEVER compare SMS/phone provisioning time — A2P 10DLC binds SF's BYO-Twilio equally and SF's own A2P is pending. G2 counts are AI-tallied/overlapping → directional volume only.
- SF difference: GENUINE on build/config time (3-minute build vs weeks).

### 3. Stacked pricing — STRONG (first-party pricing page, fetched 2026-07-16)
$97/$297/$497 ladder; **SaaS Mode (reselling) requires $497/mo**; white-label MOBILE app is a **separate $497/mo add-on** on any tier (full branding = $794–$994+/mo). Usage-metered by default: LC Email $0.675/1k on all plans, per-segment SMS, per-minute voice, A2P carrier fees, auto-refilling wallet on the agency card. Add-ons: $97/mo/sub-account AI Employee, $297/mo HIPAA (can't be disabled once bought), $500/mo premium support. Usage REBILLING (with markup) gated behind $497.
- **Phrasing guards:** fees are PUBLISHED (support docs) — say "usage-metered by default, published in support docs but absent from marketing pages," never "hidden/secret fees." "$2k/mo" only as an attributed reviewer quote. Say "SaaS Mode requires $497; white-label mobile is another $497/mo add-on," not "full white-label gated at $497." Acknowledge mitigations (BYO SMTP; rebilling on $497) to stay never-lies.
- SF difference: GENUINE — flat $99/$199/$299 with white-label + portal INCLUDED, 0% GMV on agency tiers, BYOK at provider cost.

### 4. Reliability / bugs — RECURRING, MINORITY-SENTIMENT (medium confidence)
Verified anecdotes: 30–45-day phone outage (0.5/5 G2, 2026-06-29, ticket 5786596); unannounced outages corroborated by a 4/5 reviewer GHL publicly answered; 171 wrong emails 3 days running ("server issues"); deliverability collapse 35–40%→9% (shared Mailgun IP pools); status-page feature request open since Apr 2023 (94 upvotes).
- **Phrasing guard:** ALWAYS "reviewers report" / quoted with dates — GHL aggregates 4.2–4.6/5 (G2 4.6/646). Never "GHL is broadly unreliable."
- SF difference: never-lies machinery (grounded + enforced read-back + guardrails + auto-evals) is the honest counter — sell OUR verification, not their failures.

### 5. Support — REAL BUT CONTESTED (do not attack)
BBB: 70+ tickets/2.5mo, Social Planner dead 3 months; 60+ hours no response mid-outage. BUT G2 lists "exceptional customer support" as the #3 PRO (139 positive vs 53 negative).
- **Angle:** target support-DEPENDENCY, not support quality: "a product simple enough that you don't need 70 tickets."

### 6. Billing/cancellation friction + agency-layer accountability diffusion — supporting color only
BBB n=2 resolved complaints (double-charge after cancel; $1,142 unnotified, refund routed through the agency owner). Trustpilot: cancellation blocked behind password-that-never-validates for Gmail signups; card-blocking advice. Guides now advise screenshotting cancellation confirmations.
- **Phrasing guard:** "BBB complaints allege… (resolved)". Use as color, never headline.

### 7. White-label burden shift — HIGH confidence, PARTIAL differentiation
"You become their software provider" (Capterra, Dec 2025); every client question routes to the agency; 6–8 weeks team onboarding; a whole third-party industry (Fusemate, GHL Experts) exists to offload it; GHL sells relief via $497 SaaS Pro support add-on.
- **Honest contrast:** SF also puts the agency in the operator seat — claim "reliable and simple enough that operating it isn't a second job" + the shared client portal. NEVER "no support burden."

## REFUTED (0-3) — never use, and purge if found in our content
1. "$30–100/client/month metered COGS" figure (netpartners) — killed.
2. "GHL reseller customers don't own their account/data" (efficient.app) — killed.
Also prohibited: "hidden/secret fees" · "$2k/mo minimum" as fact · "GHL support is terrible" · "zero data egress" · any SMS-provisioning-time comparison (until SF A2P clears) · any GHL AI-quality claim (theme returned ZERO verified claims — open question).

## The messaging-upgrade plan

### A. Homepage (live agency surface after #100/#103)
Ground each of the three pillars in a verified pain (light touches, no restructure):
- **never-taxes** (pricing section/FAQ): add the two concrete GHL anchors — "reselling elsewhere starts at $497/mo before usage fees" and "no per-email meter, no wallet auto-refills." Datestamp: "per GHL's pricing page, July 2026."
- **never-lies** (FAQ/receipts): keep selling read-back + guardrails + auto-evals as OUR machinery; if citing GHL at all, attributed quotes only.
- **speed**: "live in minutes — not the 2–4-week implementations reviewers report" (attributed, safe).

### B. /agencies — lead with ownership + the math story
1. NEW comparison table: SF $99 (reselling + white-label + portal included, 0% GMV, BYOK at cost) vs GHL $497 SaaS Mode + $497/mo white-label mobile add-on + metered usage (rebilling gated at $497). Every GHL cell datestamped + linked.
2. NEW ownership block: "Your clients' sites and agents are YOURS — AGPL, export anything, self-host anytime," anchored to GHL's own no-export help doc (quote + link). This is the unassailable section.
3. Crossover math stated openly (§1b): agency margin at $300–800/mo retail per client.

### C. vs-GHL pages (components/seo/seldonframe-vs-page.tsx + gohighlevel guides)
Restructure by the four strong themes in evidence order: lock-in → complexity → pricing stack → reliability-as-reported.
1. Lock-in section FIRST, quoting GHL's help article verbatim with link.
2. Exact published prices with "per GHL's pricing page, July 2026" datestamps.
3. G2/Capterra/BBB quotes with attribution + dates; ratings context given.
4. **Honesty box** (the never-lies proof): "GHL rates 4.2–4.6/5 aggregate · its fees are published in its docs · A2P registration applies to every SMS platform including us." The box is the differentiator — no competitor page does this.
5. Purge any of the prohibited claims above if present (some guides may carry the $2k figure or secret-fee framing).

### D. Refresh discipline
- Re-fetch gohighlevel.com/pricing + export help doc before publishing; datestamp every cited price/quote (monthly-refresh loop already exists for competitor pricing).
- The 41-claim sweep standard applies: every new GHL claim needs a primary source pinned in the PR.

## Open questions (next research passes)
1. GHL AI Employee quality complaints (r/GoHighLevel, YouTube, community) — ZERO verified claims surfaced; most direct never-lies battleground. (Reddit blocked the crawler this run.)
2. Quantified churn-reason distribution — all evidence is complaint-side.
3. Deliverability failure prevalence in 2026 (shared-IP pools) — anecdote vs systemic.
4. Does organic Reddit/X/HN sentiment match the review-platform ranking?

## Source quality note
All 23 surviving claims trace to review platforms (G2/Capterra/Trustpilot), BBB, or GHL primary docs; affiliate/competitor blogs were used only where corroborated by primary sources. TrustRadius, highlevel.ai, inflowave.io returned nothing usable (marked unreliable).
