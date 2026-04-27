# Pre-launch end-to-end test protocol

**Owner:** Max
**Tester:** Max (or a non-Max human if available)
**Last updated:** 2026-04-26
**Target:** SeldonFrame v1.0 launch

---

## How to use this document

This is a **manual** test protocol executed on a **clean environment** that is NOT your development machine. Every checkbox is a discrete pass/fail. Below each substantive item is a `Notes:` line for observations, screenshots, or error text.

If anything fails, log it in [Section 9 — Findings](#section-9--findings-log) with a P0/P1/P2 classification per [Section 9 — Classification](#classification). **Zero P0 issues open is a hard launch gate.**

> **Why this matters:** the value of this protocol is Max experiencing exactly what a new user experiences — including the friction, the confusion, and the "wait, what do I do next?" moments. A test that lives only on your dev machine misses the gaps your environment quietly filled in.

---

## Section 1 — Environment setup (clean slate)

The tester must use a **fresh machine, VM, or freshly-created OS user profile** that has never run SeldonFrame development.

> ⚠ The test must NOT rely on any environment variable, config file, database, or cached dependency from the development environment. Everything starts from zero.

### 1.1 Hardware / OS

- [ ] Fresh machine, VM, or new user profile confirmed (no inherited config)
  - Notes:

### 1.2 Required installs

For each, install on the clean machine using the documented command, then run the verify command.

#### Node.js 20+

**macOS (Homebrew):**
```bash
brew install node@20
```
**macOS (nvm):**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20 && nvm use 20
```
**Windows (winget):**
```powershell
winget install OpenJS.NodeJS.LTS
```

Verify:
```bash
node --version   # expect v20.x or higher
```
- [ ] Node 20+ installed
  - Version observed:
  - Notes:

#### pnpm 10+

```bash
npm install -g pnpm
```

Verify:
```bash
pnpm --version   # expect 10.x or higher
```
- [ ] pnpm 10+ installed
  - Version observed:
  - Notes:

#### Git

**macOS:**
```bash
brew install git
```
**Windows:**
```powershell
winget install Git.Git
```

Verify:
```bash
git --version
```
- [ ] Git installed
  - Version observed:
  - Notes:

#### Claude Code

Follow the official install at <https://docs.claude.com/en/docs/claude-code/overview>. Then:
```bash
claude --version
claude auth status
```
- [ ] Claude Code installed
  - Version observed:
- [ ] Claude Code authenticated
  - Notes:

#### A modern browser

- [ ] Chrome, Firefox, or Safari (latest stable) installed
  - Browser/version:

### 1.3 Required accounts (BYO)

- [ ] **Anthropic API key** obtained at <https://console.anthropic.com/settings/keys>
  - Key prefix (last 4 chars only) for tracking:
- [ ] **Twilio test account** at <https://www.twilio.com/try-twilio> — Account SID + Auth Token + a test number provisioned
  - Notes:
- [ ] **Resend account** at <https://resend.com/signup> — API key created, verified sender domain (or `onboarding@resend.dev` for testing)
  - Notes:

### 1.4 Sanity baseline

- [ ] Confirm `~/.seldonframe` does NOT exist (must be a fresh shell)
- [ ] Confirm no `seldonframe` MCP server registered yet:
  ```bash
  claude mcp list | grep -i seldon   # expect: no match
  ```
  - Notes:

---

## Section 2 — Website + discovery path

Test the path a new user takes **before** installing.

### 2.1 Landing page (<https://seldonframe.com>)

- [ ] Page loads without errors (no console errors in DevTools)
  - Notes:
- [ ] All top-nav links resolve: **Docs**, **GitHub**, **Pricing**, **Blog**
  - Notes:
- [ ] **Start for $0** CTA navigates to `/docs/quickstart`
  - Notes:
- [ ] **Watch the demo** CTA navigates to `/demo`
  - Notes:
- [ ] Pricing nav link smooth-scrolls (or navigates) to the pricing section
  - Notes:
- [ ] Discord float button (bottom-right, if present) opens <https://discord.gg/sbVUu976NW>
  - Notes:
- [ ] Footer: GitHub, Docs, Discord, X, Blog, Privacy, Terms — all resolve
  - Notes:
- [ ] Mobile width (≤ 480px viewport via DevTools): page renders cleanly, hero readable, CTA tappable
  - Notes:
- [ ] Hero terminal block is readable AND the displayed commands match what `/docs/quickstart` actually instructs
  - Notes:
- [ ] **MCP browse link** ("→ Browse 25+ MCP servers for SMB operators") under Infrastructure section navigates to `/docs/mcp-servers`
  - Notes:

### 2.2 Quickstart page (<https://seldonframe.com/docs/quickstart>)

- [ ] Page loads without errors
  - Notes:
- [ ] Prerequisites listed match what was installed in Section 1
  - Notes:
- [ ] All three install commands are copy-pasteable (no smart-quotes, no hidden chars)
  - Test by copy-pasting into a terminal and visually inspecting before pressing enter
  - Notes:
- [ ] "What's next" links resolve: `/docs/mcp-servers`, `/demo`, `/docs`, GitHub repo
  - Notes:

### 2.3 GitHub repo (<https://github.com/seldonframe/seldonframe>)

- [ ] README renders correctly (hero, features, quickstart, infrastructure, pricing, community)
  - Notes:
- [ ] Quickstart commands in README match the website quickstart page exactly
  - Notes:
- [ ] CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, LICENSE all present and render
  - Notes:
- [ ] `/issues/new/choose` shows both **Bug report** and **Feature request** templates
  - Notes:
- [ ] Repo description ("About" sidebar) is set, and topics include `mcp`, `crm`, `nextjs`, `business-os` (or similar)
  - Notes (if missing, P1 — add via repo settings):

### 2.4 Discord (<https://discord.gg/sbVUu976NW>)

- [ ] Invite link opens Discord app or web client cleanly
  - Notes:
- [ ] On joining, a #welcome message is pinned and explains what SeldonFrame is + where to ask questions
  - Notes (if missing, P0 — write before launch):
- [ ] Channel structure includes at minimum: #welcome, #general, #help, #show-and-tell
  - Channels observed:
- [ ] A test post in #general posts successfully (no permission gate that traps new members)
  - Notes:

### 2.5 MCP servers page (<https://seldonframe.com/docs/mcp-servers>)

- [ ] Page loads without errors
  - Notes:
- [ ] Status legend renders with live counts (verified / community / experimental)
  - Counts observed (expect 18 / 10 / 1):
- [ ] All 8 categories render with at least one server card each
  - Categories observed:
- [ ] **Spot-check 5 random server entries** — click each repo link, confirm it loads a real, recently-updated repo
  - Servers checked + outcome:
- [ ] "Last verification: 2026-04-26" footer disclaimer present
  - Notes:

---

## Section 3 — Installation path

Test the exact install flow from the quickstart page on the clean machine.

### 3.1 MCP installation

```bash
claude mcp add seldonframe -- npx -y @seldonframe/mcp
```

- [ ] Command succeeds with exit code 0
  - Exact stdout (paste below):
  ```
  ```
- [ ] No errors in stderr
  - Notes:
- [ ] After install, `claude mcp list` shows `seldonframe` as connected
  - Notes:
- [ ] In a new Claude Code conversation, ask `"What SeldonFrame tools do you have?"` — Claude lists at least: `create_workspace`, `list_workspaces`, `query_brain`, `seldon_it`, `install_*` block tools
  - Tools listed:

### 3.2 First workspace creation

In Claude Code:
```
create_workspace({ name: "Test Business" })
```

- [ ] Tool call succeeds
  - Exact response (paste structured output below):
  ```
  ```
- [ ] Workspace ID returned (format: `wsp_*`)
  - Workspace ID:
- [ ] Default theme applied (verifiable via response or `query_brain`)
  - Notes:
- [ ] Admin dashboard URL provided in response
  - URL observed:
- [ ] Customer portal URL provided in response
  - URL observed:
- [ ] Both URLs load in browser without errors
  - Admin: ✓ / ✗
  - Portal: ✓ / ✗
  - Notes:

### 3.3 First block scaffold

In Claude Code:
```
install_formbricks_intake({})
```
*(or whichever block tool is documented as the "first block" in quickstart — adjust if the quickstart says `install_caldiy_booking` or similar)*

- [ ] Block install succeeds
  - Exact response:
  ```
  ```
- [ ] Block files generated (visible via `list_workspaces` or block-listing tool)
  - Notes:
- [ ] Admin UI for the block renders in the dashboard (navigate to the block's section)
  - Notes:
- [ ] Customer portal surface for the block renders (navigate to portal's intake/booking page)
  - Notes:
- [ ] No hand-edits required to make the block functional
  - Notes:

### 3.3.1 KNOWN ISSUES TO WATCH (from SLICE 9 scaffolder findings)

If any of these surface, document the **exact error** and flag as **P0 launch-blocker**:

- [ ] Validation gate trips on pre-existing baseline errors → workaround was `--skip-validation` flag
  - If observed, error text:
- [ ] Spec path resolution requires absolute paths (relative paths fail)
  - If observed, error text:
- [ ] Generated code references symbols that don't exist in the host workspace
  - If observed, error text:

---

## Section 4 — Core functionality

Test each major feature with the scaffolded "Test Business" workspace from Section 3.

### 4.1 Admin dashboard

- [ ] Dashboard loads with header showing **"Test Business"** (the workspace name from Section 3.2)
  - Notes:
- [ ] Sidebar navigation works — every link resolves to a rendering page (no 404s, no blank pages)
  - Pages visited and outcome:
- [ ] Customer list view renders (empty state acceptable)
  - Notes:
- [ ] Empty states show **helpful copy** ("No customers yet — let's create one") — not blank/error-looking
  - Notes:
- [ ] Mobile width (≤ 480px): sidebar collapses to hamburger, content remains readable
  - Notes:

### 4.2 Customer portal

- [ ] Portal loads with the workspace name visible
  - Notes:
- [ ] **"Powered by SeldonFrame"** badge renders (footer or header)
  - Notes:
- [ ] Default theme colors apply consistently (no unstyled FOUC)
  - Notes:
- [ ] Mobile width: portal renders cleanly
  - Notes:

### 4.3 Theming via natural language

In Claude Code, prompt:
```
Update the workspace theme: dark navy background, gold accents,
modern serif headings, family-business voice.
```

- [ ] Claude Code calls the appropriate theming tool (visible in conversation)
  - Tool called:
- [ ] Theme applies to admin dashboard (refresh browser)
  - Notes:
- [ ] Theme applies to customer portal (refresh browser)
  - Notes:
- [ ] Brand colors update correctly (verify in DevTools → computed styles)
  - Notes:

**Document the prompt you used and the outcome:**
> Prompt:
>
> Outcome:

### 4.4 Agent flow composition

In Claude Code, prompt:
```
Add an archetype that sends a welcome SMS to a new customer
the moment they're created in the CRM.
```

- [ ] Claude Code composes the archetype from primitives (visible in conversation)
  - Notes:
- [ ] Archetype appears in `/agents` view in the admin dashboard
  - Notes:
- [ ] Archetype's trigger is `contact.created` (or whichever new-customer event maps)
  - Notes:
- [ ] Archetype's first step is an SMS dispatch (likely `mcp_tool_call` → `send_sms`)
  - Notes:

**Document the prompt and outcome:**
> Prompt:
>
> Outcome:

### 4.5 Test mode

- [ ] Toggle test mode ON in workspace settings (Settings → Test Mode)
  - Notes:
- [ ] Admin shows persistent banner: **"Test mode active"**
  - Notes:
- [ ] Customer portal shows **"Demo / Test"** badge
  - Notes:
- [ ] Trigger an SMS dispatch (run the archetype from 4.4 manually) — verify in `/agents/runs` event log that the SMS routes to test-mode endpoints (NOT to a real phone)
  - Notes:
- [ ] Toggle test mode OFF
- [ ] Banner and badge disappear
  - Notes:

### 4.6 Approval gates

In Claude Code, prompt:
```
Modify the welcome-SMS archetype: before sending the SMS,
add a request_approval step so I can review the message
in the dashboard first.
```

- [ ] Modification succeeds and is reflected in `/agents` view
  - Notes:
- [ ] Run the workflow (manually trigger or create a contact)
- [ ] Approval drawer appears in `/agents/runs`
  - Notes:
- [ ] **Approve** → workflow continues to send SMS
  - Notes:
- [ ] Run again, this time **Reject** → workflow follows the reject path (no SMS)
  - Notes:
- [ ] Magic-link approval email is generated (verify in test-mode email log)
  - Notes:

### 4.7 Cost observability

In Claude Code, prompt:
```
Add an archetype that uses llm_call: when a contact submits
the intake form, summarize their submission and post the
summary as an internal note on the contact.
```

- [ ] Archetype created with an `llm_call` step
  - Notes:
- [ ] Trigger the workflow (submit a test intake form)
- [ ] Run completes successfully
- [ ] In `/agents/runs`, open the run drawer
- [ ] **Per-run cost shows a non-zero value** (e.g. `$0.00xx`)
  - Cost observed:
- [ ] **Token counts (input/output) visible**
  - Tokens observed:
- [ ] Cost calculation roughly matches the rate for the model used (check current Anthropic pricing if uncertain)
  - Notes:

> ⚠ If the cost is `$0` or token counts are missing, this contradicts the SLICE 11 close-out and is **P0**.

### 4.8 Scheduled triggers

- [ ] Create an archetype with a scheduled trigger (e.g. "every Monday 9am, send the team a digest of the week's new contacts")
  - Notes:
- [ ] Verify the trigger appears in the scheduled-triggers list (admin → Agents → Schedules)
  - Notes:
- [ ] Verify the cron expression is parsed correctly (UI shows next-fire time)
  - Next-fire time observed:
- [ ] *(Optional, time-permitting)* Set the trigger to fire in the next 5 minutes and observe it actually fires
  - Notes:

### 4.9 Message triggers

- [ ] Create an archetype with an SMS-message trigger (e.g. "when an inbound SMS contains 'PRICING', reply with the pricing page link")
  - Notes:
- [ ] Send a test SMS to your Twilio test number with the trigger keyword
  - Notes:
- [ ] Trigger fires and workflow executes (visible in `/agents/runs`)
  - Notes:
- [ ] Pattern matching distinguishes between trigger keyword and unrelated messages (send an SMS without the keyword — should NOT fire)
  - Notes:

---

## Section 5 — HVAC worked example

Test the Desert Cool HVAC example end-to-end. This is the marketing demo path.

### 5.1 Seed the HVAC example

Run the documented seed script (per docs):
```
install_vertical_pack({ pack: "hvac" })
```
*or the documented HVAC-specific install command*

- [ ] Seed succeeds without errors
  - Notes:
- [ ] **~300 customers** populated (sample seed size — verify exact count)
  - Customer count observed:
- [ ] **Equipment data** populated (units per customer with install dates, brands, warranties)
  - Notes:
- [ ] **Service history** populated
  - Notes:
- [ ] **14 technicians** in roster
  - Technician count observed:

### 5.2 HVAC admin dashboard

- [ ] Dashboard renders with **Desert Cool HVAC** branding (logo/name in header)
  - Notes:
- [ ] Customer list shows realistic, diverse data (not Lorem Ipsum)
  - Notes:
- [ ] Equipment view shows per-customer units
  - Notes:
- [ ] Service-call view shows history with status, technician, customer
  - Notes:
- [ ] Technician roster renders with names, schedules, current load
  - Notes:

### 5.3 HVAC customer portal

- [ ] Portal renders with Desert Cool HVAC theme (desert tans, AC-blue accents per soul brief)
  - Notes:
- [ ] Equipment list visible per customer (when logged in as test customer)
  - Notes:
- [ ] Service history visible per customer
  - Notes:
- [ ] **"Powered by SeldonFrame"** badge renders correctly (not stripped, not broken layout)
  - Notes:

### 5.4 HVAC archetypes

For each, verify it appears in `/agents` AND its trigger is correctly configured:

- [ ] **Pre-season maintenance campaign** — manual trigger or scheduled, fires correctly
  - Notes:
- [ ] **Emergency triage** — message trigger configured (e.g. "AC NOT WORKING" SMS keyword)
  - Notes:
- [ ] **Heat advisory** — scheduled trigger configured (e.g. weather-conditional schedule)
  - Notes:
- [ ] **Post-service follow-up** — subscription on `service_call.completed` event
  - Notes:

### 5.5 HVAC marketing-claim reconciliation

> Per SLICE 11 close-out: the four HVAC archetypes do NOT currently use `llm_call` and produce $0 cost when run.

- [ ] After running the heat-advisory archetype, check `/agents/runs` — confirm the per-run cost is **$0** (no llm_call in the path)
  - Cost observed:
- [ ] If marketing copy still claims "$0.32 heat advisory" anywhere, flag as **P0** — copy must be reframed before launch (per SLICE 11 close-out recommendation)
  - Notes:

---

## Section 6 — Second workspace (multi-tenant validation)

Verify workspace isolation by creating a second workspace and confirming no bleed.

### 6.1 Second workspace creation

In Claude Code:
```
create_workspace({ name: "Second Business" })
```

- [ ] Succeeds, returns a different `wsp_*` ID
  - Workspace ID:
- [ ] Admin dashboard for the second workspace shows empty data (no Test Business / HVAC data)
  - Notes:
- [ ] Customer list in workspace 2 is empty (or shows ONLY workspace-2 customers if any were created)
  - Notes:

### 6.2 Different theme

- [ ] Apply a clearly-distinct theme to workspace 2 (e.g. light theme, sans-serif)
  - Notes:
- [ ] Customer portal for workspace 2 shows the new branding
  - Notes:
- [ ] Workspace 1 theme **unchanged** (refresh workspace 1 admin/portal — verify still original theme)
  - Notes:

### 6.3 Isolation verification

- [ ] Blocks installed in workspace 1 do NOT appear in workspace 2's `/admin/blocks` view
  - Notes:
- [ ] Agent flows in workspace 1 do NOT fire when triggers happen in workspace 2 (e.g. submit an intake form in workspace 2 — verify workspace 1's archetype runs are unchanged)
  - Notes:
- [ ] Test mode toggled ON in workspace 1 does NOT activate test mode in workspace 2
  - Notes:
- [ ] *(Bonus, time-permitting)* Switch back to workspace 1 — all original data still intact
  - Notes:

> ⚠ Per G-9-7 (workspace isolation invariant): any failure in 6.3 is **P0** — multi-tenant architecture is the core of the product.

---

## Section 7 — Failure modes + edge cases

Deliberately test things that might break. Good error messages are the difference between a user filing a bug and a user giving up.

### 7.1 Missing prerequisites

- [ ] Run `claude mcp add seldonframe -- npx -y @seldonframe/mcp` **before installing Claude Code** (use a different fresh shell)
  - Error message observed:
  - Helpful? Y / N — if N, P1
- [ ] Use Node.js 18 (downgrade temporarily) and try `seldon init`
  - Error message observed:
  - Helpful? Y / N
- [ ] Uninstall pnpm (or rename binary) and try a `seldon scaffold` command
  - Error message observed:
  - Helpful? Y / N

### 7.2 Invalid inputs

- [ ] `create_workspace({ name: "" })` — empty name
  - Error message observed:
  - Helpful? Y / N
- [ ] `install_*({})` block tool with a malformed name argument (e.g. spaces, slashes)
  - Error message observed:
  - Helpful? Y / N
- [ ] Invoke a tool that takes JSON args with deliberately-malformed JSON
  - Error message observed:
  - Helpful? Y / N

### 7.3 Network failures

- [ ] Set `ANTHROPIC_API_KEY=invalid` and run an `llm_call` archetype
  - Error message observed:
  - Helpful? Y / N — does it tell the user to check their key?
- [ ] Disable Twilio credentials with test mode OFF, trigger an SMS workflow
  - Error message observed:
  - Helpful? Y / N
- [ ] Block outbound network (firewall) and try an MCP tool call
  - Error message observed:
  - Helpful? Y / N

### 7.4 Browser compatibility

For each browser available, run admin dashboard + customer portal:

| Browser | Admin works? | Portal works? | Notes |
|---|---|---|---|
| Chrome (latest) | | | |
| Firefox (latest) | | | |
| Safari (latest, if available) | | | |
| Mobile Safari (iPhone, if available) | | | |
| Mobile Chrome (Android, if available) | | | |

---

## Section 8 — Timing

Stopwatch the actual experience. Compare against marketing claims at the end.

| Operation | Actual time | Notes |
|---|---|---|
| `claude mcp add seldonframe -- npx -y @seldonframe/mcp` → command finishes | | |
| First workspace running (init succeeds + dashboard loads) | | |
| First block scaffolded + UI rendering | | |
| First agent flow composed + visible in `/agents` | | |
| Clean install → "I have a working Business OS" (subjective end-state) | | |

### Marketing-claim reconciliation

| Claim | Source | Actual | Within 2x? |
|---|---|---|---|
| "Ship in minutes" | Landing hero | | |
| "About six minutes" / "Three minutes" | Landing How-it-works | | |
| "Five minutes from clone to first run" | Quickstart page | | |
| "Three commands. About six minutes." | Quickstart hero | | |

> If actual exceeds claim by **>2x**, log as P0 — marketing copy must be updated before launch.

---

## Section 9 — Findings log

For every failure or surprise, log here. Be exhaustive — this is the working list of launch blockers.

### Classification

- **P0 — Launch blocker (must fix before launch):**
  - Install path broken
  - Scaffolder fails on clean environment
  - Admin dashboard or customer portal won't load
  - Core primitives don't work (triggers, steps, Soul, llm_call, request_approval)
  - Marketing claims contradicted by actual experience
  - Workspace isolation breaks (G-9-7 violation)
  - Any "I would give up here" moment for a reasonable new user
- **P1 — Fix in week 1 post-launch:**
  - Minor UI glitches
  - Edge-case error messages not helpful
  - Non-critical feature partially broken (with workaround)
  - Documentation inaccurate but workaround obvious
- **P2 — Fix later:**
  - Polish
  - Feature requests surfaced during testing
  - Performance optimizations
  - Nice-to-have improvements

### Findings template

For each finding, copy this block and fill it in:

```
### Finding #N — <short title>

**Class:** P0 / P1 / P2
**Section:** <e.g. 3.3 First block scaffold>
**What happened:**

**Expected behavior:**

**Steps to reproduce:**
1.
2.
3.

**Screenshot / log:**
<attach or paste>

**Suggested fix (if obvious):**
```

#### Findings

*(populate during testing)*

---

## Section 10 — Sign-off criteria

Launch is **GO** when **every** box below is checked.

- [ ] Section 2 (website + discovery) — all checks pass
- [ ] Section 3 (installation) — all checks pass on the clean machine
- [ ] Section 4 (core functionality) — all checks pass
- [ ] Section 5 (HVAC example) — runs end-to-end, marketing-claim reconciliation done
- [ ] Section 6 (multi-tenant isolation) — verified, zero bleed
- [ ] Section 7 (failure modes) — error messages reviewed, P1+ logged
- [ ] Section 8 (timing) — all marketing claims within 2x of actual
- [ ] Section 9 — **zero open P0 issues**
- [ ] At least one **non-Max human** has completed Sections 3–4 successfully
  - Tester:
  - Date:
  - Notes:

When all criteria met:

> **LAUNCH IS GO.**

---

## Appendix — Tester checklist before starting

Before opening this protocol, the tester should have:

- [ ] A clean machine / VM / fresh user profile
- [ ] All Section 1 prerequisites installed and verified
- [ ] All Section 1 BYO accounts created with credentials in hand
- [ ] A timer / stopwatch (for Section 8)
- [ ] A screenshot tool ready (for Section 9 evidence)
- [ ] This document open on a tablet, second monitor, or printout (NOT on the same screen as the testing browser)
- [ ] A blank text file or notebook for inline notes
- [ ] ~3 hours blocked for end-to-end execution

Estimated total time: **2–4 hours** depending on findings.

---

*Last verification of this document's links and commands: 2026-04-26.
If you find a broken instruction, fix it in this file and PR it — pre-launch
testing is itself a continuous improvement loop.*
