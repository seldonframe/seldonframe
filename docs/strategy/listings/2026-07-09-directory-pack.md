# Directory Submission Pack — 2026-07-09

Research + paste-ready copy for listing SeldonFrame on open-source / software directories.
**Nothing in this doc has been submitted.** A human (Max) or the coordinator executes each section.

## Canonical facts (every claim below is true as of 2026-07-09 — reuse these, don't improvise)

- **Product**: SeldonFrame — open-source "AI front office" for local service businesses. AI receptionist (voice calls, SMS, web chat) + website builder + CRM + booking + intake forms, all on one data model.
- **Try-before-signup**: paste your existing website URL → SeldonFrame builds a real hosted workspace → you claim it afterward. No signup, no card, no API key to start.
- **Pricing**: first hosted workspace free forever; paid hosted plans from **$29/month flat** (managed $49; agency tiers above). No usage tax on the builder plan.
- **License**: AGPL-3.0. Self-hostable from the repo.
- **Repo**: https://github.com/seldonframe/seldonframe — TypeScript, Next.js, MCP-native (drive it from Claude Code or any MCP client). Created **2026-03-26**. **Zero git tags / zero releases** as of today. 7 stars. Repo **description field is EMPTY** (fix below).
- **Site**: https://www.seldonframe.com — `/tools` hub, `/best/*` pages, `/alternatives`, `/alternative-to-gohighlevel` all live in prod (verified 200 today).
- **Agencies**: whitelabel + client sub-accounts.
- Positioning hook: **"open-source GoHighLevel alternative."**

⚠️ **Do NOT duplicate**: 3 skills-list PRs are already OPEN elsewhere — travisvn#941, BehiSecc#423, VoltAgent#754. Those ARE our awesome-list PRs for the agent-skills angle. Do not re-submit SeldonFrame to those lists or their forks.

---

## 0. Prerequisite fix (do first, 2 min, agent-doable)

The GitHub repo has **no description**. Every directory below scrapes it. Set:

> Open-source AI front office for local service businesses — AI receptionist (voice/SMS/chat), website, CRM, booking, intake forms. Self-hostable GoHighLevel alternative. First hosted workspace free.

Command (needs repo admin `gh` auth):

```
gh repo edit seldonframe/seldonframe --description "Open-source AI front office for local service businesses — AI receptionist (voice/SMS/chat), website, CRM, booking, intake forms. Self-hostable GoHighLevel alternative. First hosted workspace free."
```

---

## 1. AlternativeTo.net — **Max-click** (account gate)

### Mechanics (verified 2026)
- Account required. **New accounts must wait 1 week** before they can submit an app (anti-spam policy) — if Max has no aged account, create one TODAY and submit next week.
- Submit via user icon (top right) → **"Suggest new application"**. Fields: name/purpose → optional app-store import (skip) → main data (platforms, license/pricing, description, tags) → suggest alternatives.
- Moderation: typically 1–2 days. 2026 policy is stricter — they decline more apps than before, so the description must read like a real product, not marketing.
- Post-approval: keep adding "alternative to" links over time; each one is an internal reference that surfaces us on that app's page.

### Ready to paste

**App name**: SeldonFrame

**Tagline** (77 chars):
> Open-source GoHighLevel alternative — AI receptionist, CRM, booking, website

**Full description** (~120 words):
> SeldonFrame is an open-source GoHighLevel alternative for local service businesses. It bundles the whole front office: an AI receptionist that answers phone calls, SMS, and web chat; a website builder; a CRM with pipelines; online booking; and intake forms. Everything shares one data model, so a call becomes a contact, a booking, and a follow-up automatically. You can try it before signing up: paste your existing website and SeldonFrame builds a working hosted workspace you claim afterward — no account or card needed to start. The first hosted workspace is free forever; paid plans start at $29/month flat. Agencies can whitelabel it and run client sub-accounts. The code is AGPL-3.0 and self-hostable from GitHub. TypeScript, Next.js, MCP-native.

**License / pricing selection**: Open Source (AGPL-3.0) · Freemium (free tier + paid from $29/mo)

**Platform tags**: Online (Web) · Self-Hosted

**Category picks**: Business & Commerce → CRM Systems; secondary: Office & Productivity (scheduling/booking)

**Tags** (be generous — they drive internal promotion): crm, ai-receptionist, appointment-scheduling, booking, website-builder, intake-forms, sms, ai-agents, self-hosted, agency, local-business

**"Alternative to" seed list** (add all): GoHighLevel, HubSpot, Podium, Vendasta, Smith.ai, Goodcall, Calendly, Jobber

**Screenshots (4)** — capture at 1920×1080, light-on-dark theme as rendered:
1. `https://www.seldonframe.com/` — homepage hero with the paste-your-site chatbox (the try-before-signup flow, our differentiator)
2. `https://www.seldonframe.com/tools` — free tools hub (shows breadth: calculators, generators)
3. `https://www.seldonframe.com/best/ai-receptionist-for-plumbers` — a /best page (verified live; shows the local-service focus)
4. A logged-in workspace dashboard (CRM pipeline + inbox view from the Seldon Studio demo workspace) — the actual product, not just marketing pages

---

## 2. OpenAlternative.co — **Max-click** (form + account/dashboard)

### Mechanics (verified 2026)
- Submit at **https://openalternative.co/submit** (web form, not GitHub — the repo's PR/seed route exists but the form is the supported path).
- Free queue; submission does not guarantee a feature. A paid expedite is offered at checkout — **skip it** per our rules.
- Stated criteria (we meet all four): project is open source · actively maintained · available in English · an alternative to proprietary software.
- Have ready: description, logo, screenshots (reuse the 4 above), repo URL. Site auto-pulls stars/license from GitHub — another reason to fix the repo description first.

### Ready to paste

**Name**: SeldonFrame
**Website**: https://www.seldonframe.com
**Repository**: https://github.com/seldonframe/seldonframe

**Description**:
> Open-source AI front office for local service businesses. An AI receptionist answers calls, SMS, and web chat; a website, CRM, booking, and intake forms come in the same box, sharing one data model. Try it before signing up: paste your website URL and it builds a live hosted workspace you claim afterward. First hosted workspace free forever; paid from $29/month. AGPL-3.0, self-hostable, whitelabel for agencies. TypeScript + Next.js, MCP-native.

**Alternative to** (proprietary tools): GoHighLevel, HubSpot, Podium, Vendasta, Smith.ai, Goodcall
**Categories**: CRM · AI · Scheduling/Booking · Marketing Automation

---

## 3. LibHunt — **agent-doable** (no form exists; it's metadata + mentions)

### Mechanics (verified 2026)
- **There is no manual submission form.** LibHunt (512K+ projects) indexes from three signals: (a) mentions on Reddit / Hacker News / dev.to (monitored near-real-time), (b) awesome lists — e.g. `selfhosted.libhunt.com` mirrors awesome-selfhosted, (c) GitHub metadata (topics, description) for categorization.
- Our levers, in order: **set GitHub topics now** → land awesome-selfhosted when eligible (§4) → organic Reddit/HN mentions (NOT Show HN yet, see §6 — ordinary comment mentions count).

### Repo topics — current vs. target

Current 12 topics (via GitHub API today):
`agent-skills, agents, ai-agent, claude-code, claude-skills, crm, llm, mcp, mcp-server, model-context-protocol, small-business, website-builder`

**ADD these 8** (GitHub caps at 20 — this lands exactly at the cap):
`self-hosted, nextjs, typescript, ai-receptionist, booking-system, gohighlevel-alternative, voice-ai, chatbot`

Command (repo admin):

```
gh repo edit seldonframe/seldonframe --add-topic self-hosted --add-topic nextjs --add-topic typescript --add-topic ai-receptionist --add-topic booking-system --add-topic gohighlevel-alternative --add-topic voice-ai --add-topic chatbot
```

Rationale: `self-hosted` and `nextjs` are the two highest-traffic discovery topics we're missing; `gohighlevel-alternative` owns the positioning query; the rest map to our /best category pages.

---

## 4. awesome-selfhosted — **verdict: DOES NOT QUALIFY TODAY. Do not submit.**

### Mechanics (verified 2026)
- Contributions now go to **github.com/awesome-selfhosted/awesome-selfhosted-data** as a YAML file (`software/seldonframe.yml`), one software per PR; the markdown list is generated from it.
- Hard rules (verbatim from CONTRIBUTING): *"Any software project you are adding was first released more than 4 months ago."* Releases must be **tagged** — they have a canned rejection: *"there are no tagged releases for this project."* Descriptions must avoid the words open-source/free/self-hosted; `(alternative to $PRODUCT)` suffix is their house style. They **ban accounts** for LLM-generated PRs that ignore the guidelines — a sloppy early PR is worse than no PR.

### Honest verdict
**Blocked on two counts:**
1. **Zero tagged releases** (verified via GitHub API today). This alone gets the canned rejection instantly.
2. **First-release age**: the repo was created 2026-03-26 (~3.5 months ago) and the age rule counts from **first release**, which doesn't exist yet. Even the most charitable reading (repo age) doesn't clear 4 months until **2026-07-26**.

**Unblock plan**: tag `v1.0.0` (or `v0.x`) this week and keep tagging regular releases. Under the strict reading (4 months after the first tag), the earliest credible submission is **early November 2026**. Do not argue the charitable reading in the PR — maintainers check the releases page dates, and a rejected PR burns credibility. Also worth building stars first (currently 7; no formal minimum, but low traction invites scrutiny).

### Entry to submit WHEN eligible (`software/seldonframe.yml`)

```yaml
name: SeldonFrame
website_url: "https://www.seldonframe.com"
source_code_url: "https://github.com/seldonframe/seldonframe"
description: "AI front office for local service businesses - AI receptionist for calls/SMS/web chat, plus website builder, CRM, booking and intake forms (alternative to GoHighLevel)."
licenses:
  - AGPL-3.0
platforms:
  - Nodejs
tags:
  - Customer Relationship Management (CRM)
depends_3rdparty: true
```

Notes: `depends_3rdparty: true` is honest — voice requires Twilio and the AI features require an LLM API key (BYOK). Before submitting, check the `tags/` dir in awesome-selfhosted-data for the exact current tag names (CRM exists; add a scheduling/booking tag only if one exists verbatim). PR title: `add SeldonFrame`.

---

## 5. Other no-dependency wins (researched; all free, no reviews required)

### 5a. selfh.st/apps — **Max-click** (form/email, 5 min)
- **Mechanics**: directory FAQ says *"reach out and share the details of your project"* — submit via **https://selfh.st/submit/** (Submit Content) or **https://selfh.st/contact/**. License/stars auto-pulled nightly from the GitHub API. Default ranking scores repo age + latest commit + stars, so we'll rank low at first — the listing itself is the win (it's also a feeder for the This Week in Self-Hosted newsletter).
- **Paste-ready blurb**:
  > SeldonFrame (https://github.com/seldonframe/seldonframe, AGPL-3.0) — AI front office for local service businesses: an AI receptionist that answers calls, SMS, and web chat, plus website, CRM, booking, and intake forms on one data model. Self-hostable (TypeScript/Next.js); a hosted version lets you build a workspace from your website URL before signing up, first workspace free. Alternative to GoHighLevel. Site: https://www.seldonframe.com

### 5b. SaaSHub — **Max-click** (account + email verify, 10 min)
- **Mechanics**: https://www.saashub.com/services/submit — create account, verify email, paste homepage URL, fill name/tagline/categories/competitors. Free; approval 1–2 days. **Listing competitors is effectively required** (empty-competitor submissions sink to the bottom of the queue). Verifying the product raises priority.
- **Paste-ready**:
  - Name: SeldonFrame
  - Tagline: *Open-source AI front office: AI receptionist, CRM, booking, website — from $29/mo, first workspace free.*
  - Description: reuse the OpenAlternative description (§2).
  - Categories: CRM · AI Receptionist / Voice AI · Appointment Scheduling · Website Builder
  - Competitors/rivals: GoHighLevel, HubSpot, Podium, Vendasta, Smith.ai, Goodcall, Calendly, Jobber

### 5c. Open Hub (openhub.net) — **Max-click** (account, 10 min)
- **Mechanics**: create account → add project (name, URLs, license) → add the git repo as a "code location" (enlistment); Open Hub then analyzes the repo (contributors, activity, LOC) over the following hours. Pure metadata play — free backlink + open-source legitimacy signal, zero maintenance.
- **Paste-ready**: Name: SeldonFrame · License: AGPL-3.0 · Homepage: https://www.seldonframe.com · Repo: https://github.com/seldonframe/seldonframe (git, main branch) · Description: one-liner from §0.

### 5d. opensourcealternative.to — **Max-click** (form, 3 min, no account)
- **Mechanics**: https://www.opensourcealternative.to/submit — simple form, no account. Fields: email, project name, website, repo link, proprietary software name + website. Criteria (we meet all): open source · alternative to proprietary software · actively maintained · self-hosted. **Free path = waitlist (6+ months)**; a $29 expedite exists — skip it per our no-paid-placement rule, the free queue still lands eventually.
- **Paste-ready**: Project: SeldonFrame · Site: https://www.seldonframe.com · Repo: https://github.com/seldonframe/seldonframe · Proprietary alternative: GoHighLevel (https://www.gohighlevel.com).

**Skipped after research**: StackShare — still online but pivoted to enterprise tech-stack intelligence under FOSSA (acquired Aug 2024); community submissions are effectively dead weight now. Other awesome-* lists (AI-agents/skills) — already covered by the 3 open PRs (travisvn#941, BehiSecc#423, VoltAgent#754); do not duplicate.

---

## 6. Do NOT submit yet

| Target | Why it waits |
|---|---|
| **G2** | Review-gated: a profile with 0 reviews ranks dead-last and looks worse than absence — wait until we can rally 10+ real user reviews. |
| **Capterra / GetApp** | Same review problem plus pay-per-click prominence; an empty free listing under GoHighLevel's 6k reviews hurts the comparison story. |
| **Product Hunt** | One-shot launch mechanics: needs a coordinated launch day (assets, first-hour votes, community) — firing it quietly wastes the slot forever. |
| **Show HN** | One credible shot; HN reads the repo. Wait for tagged releases, a polished self-host quickstart, and more traction than 7 stars — and an aged HN account posting it. |

---

## Execution order (suggested)

1. **Today, agent**: §0 repo description + §3 topics (`gh repo edit` — needs admin auth). Tag `v1.0.0` (Max decision — starts the awesome-selfhosted clock).
2. **Today, Max**: create AlternativeTo account (1-week cooldown starts), submit §5d (3 min) and §5a (5 min).
3. **This week, Max**: §2 OpenAlternative, §5b SaaSHub, §5c Open Hub.
4. **Next week, Max**: §1 AlternativeTo submission (account now aged).
5. **~November 2026**: §4 awesome-selfhosted PR (agent preps, Max approves) — only after 4 months of tagged releases.
