# SeldonFrame Web-Onboarding Pivot — Design Spec

**Date:** 2026-05-16
**Status:** Approved, ready for implementation planning
**Predecessors:**
- 2026-05-14-pull-firecrawl-out-of-backend-design.md (established the WebFetch-via-Claude-Code extraction pattern that this spec mirrors server-side)
- 2026-05-15-agency-output-product-moment-design.md (introduced the agency-output framing this spec scales)
- 2026-05-15-ops-stack-only-workspace-creation-design.md (chatbot-first workspace defaults that the web flow inherits)
- v1.55/1.56 series — soul enrichment, business hours, demo portal, sandbox key resolution (all merged to main 2026-05-16)

---

## Strategic context

SeldonFrame today: workspace creation requires Claude Code MCP. This caps TAM at developers comfortable with a terminal. Agencies and freelancers who serve SMBs are the ICP, but most don't run `npx` commands — they expect a web interface.

The pivot: add a web onboarding path at `seldonframe.com` so agencies sign up with email or Google OAuth, land in their dashboard, and create unlimited client workspaces (one per SMB they serve) using their own Anthropic API key. Claude Code MCP stays as the power-user path — same backend, different entry point.

Reference model: [Postiz](https://postiz.com) — open-source social media scheduler hitting $100k+/mo MRR via web onboarding + paid tiers + BYOK. SeldonFrame's moat is deeper because we host the actual business infrastructure (landing pages, CRM, booking, intake), not just scheduled posts — switching cost compounds across an agency's entire book of clients.

**Goal:** Ship the front door so agencies sign up, create their first client workspace from a URL, and upgrade when they need production features (custom domain, white-label, AI agents, client portal).

---

## Locked architectural decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Scope:** full pivot (web onboarding + clients view + tier gating + marketing rebuild) shipped in 3 sequential Cuts | User chose maximalist scope. Each Cut produces working, testable software on its own — can pause between Cuts to validate. |
| 2 | **URL extraction:** Anthropic API + `web_fetch` tool, operator's BYOK Anthropic key | Mirrors Claude Code's WebFetch exactly. Anthropic handles JS rendering, anti-bot, redirects server-side. Zero managed-browser infra. Operator pays via their key. Same `EXTRACTION_INSTRUCTIONS` prompt as Claude Code path. |
| 3 | **Create-flow shape:** single-field URL paste → SSE-narrated loading state → workspace ready | Mirrors Claude Code magic moment. One screen, no wizard. Operator refines from workspace dashboard after. |
| 4 | **BYOK precondition:** inline-prompt at create time, never navigate away | Operator commits mentally to creating the workspace before being asked for the key. One-time friction on the action that needs it. |
| 5 | **Tier model:** Free=1 workspace, Growth ($29/mo)=3, Scale ($99/mo)=unlimited (matches current `plan.limits.maxOrgs`) | Workspace count IS the upgrade lever for SeldonFrame. Features (custom domain, white-label, agents, client portal) layer on top per tier. |
| 6 | **Agency identity:** lives on the `users` table as JSONB. All orgs are pure client workspaces. | Cleanest mental model: user = agency, orgs = clients. No special-case orgs, no schema gymnastics for tier counting. |
| 7 | **Post-signup onboarding:** replace `/onboarding/setup` SetupWizard with single-screen `/clients/new` (URL paste). SetupWizard files deleted. | YAGNI on framework picker / pipeline wizard for agencies. Agency profile (logo, name) configured later via `/settings/agency-profile`. |
| 8 | **Tier-gating UX:** hard block at the CTA. Click "Create Client Workspace" while at limit → upgrade modal opens immediately. | Clearest value exchange. No wasted typing. Single decision point. |
| 9 | **UI quality standard:** every new surface MUST go through Claude design skills (`design:design-system`, `design:design-critique`, `design:ux-copy`, `design:accessibility-review`) before merge. | User requirement — Claude design is best-in-class. Specific checkpoints called out per surface below. |

---

## Cut A — Web onboarding (Week 1-2)

### Schema migration

**File:** new drizzle migration `drizzle/NNNN_users_agency_profile.sql`

Add a JSONB column to `users`:

```sql
ALTER TABLE users
  ADD COLUMN agency_profile JSONB NOT NULL DEFAULT '{}'::jsonb;
```

Shape (TypeScript):

```ts
export type AgencyProfile = {
  name?: string;            // "Acme Digital"
  logo_url?: string;        // R2/S3 upload URL
  brand_color?: string;     // hex, e.g. "#7c3aed"
  website_url?: string;     // "https://acmedigital.com"
};
```

Backfill: for users with a `primaryOrgId`, populate `agency_profile.name` from that org's `name` column.

### New backend endpoint

**File:** `packages/crm/src/app/api/v1/web/workspaces/create-from-url/route.ts` (new)

```
POST /api/v1/web/workspaces/create-from-url
Auth: session cookie (NextAuth)
Body: { url: string }
Response: Server-Sent Events stream
```

**Handler flow:**

1. **Auth check** — resolve `userId` + `primaryOrgId` from session. If no session → 401.
2. **URL validation** — must match `/^https?:\/\/[a-z0-9.-]+(\.[a-z]{2,})/i` after trim. If invalid → close stream with `event: error, code: 400`.
3. **Workspace limit check** — call existing `enforceWorkspaceLimit({ primaryOrgId, ownedWorkspaceCount })`. If `allowed: false` → close stream with `event: error, code: 402, message, upgradeUrl, tier, used, limit`.
4. **BYOK precondition** — load `organizations.integrations` for `primaryOrgId`, decrypt `anthropic.apiKey` via existing `decryptIfNeeded()`. If empty → close stream with `event: error, code: 412, reason: "needs_byok"`.
5. **Extraction call** — instantiate Anthropic SDK with operator's key:
   ```ts
   const anthropic = new Anthropic({ apiKey: byokKey });
   const response = await anthropic.messages.create({
     model: "claude-sonnet-4-6",
     max_tokens: 4096,
     tools: [{ type: "web_fetch" }],
     messages: [{
       role: "user",
       content: `${EXTRACTION_INSTRUCTIONS}\n\nURL to extract: ${url}`,
     }],
   });
   ```
   Stream `event: fetching` immediately, then `event: extracting` when response arrives.
6. **Parse extracted fields** — response should contain a JSON block matching `REQUIRED_FIELDS_SCHEMA` (from existing `lib/soul-compiler/url-extraction-instructions.ts`). Parse it. If parse fails → close stream with `event: error, code: 422, reason: "extraction_failed"`.
7. **Build workspace** — call existing `createFullWorkspace({ ...fields, ownerUserId: userId })`. Stream intermediate events as each phase completes:
   - `event: soul_built`
   - `event: landing_built`
   - `event: chatbot_built` (auto-created in TEST status per v1.55)
   - `event: demo_seeded` (per v1.56)
8. **Final event** — `event: done, workspaceId, slug, dashboardUrl, publicHomeUrl, chatbotEmbedUrl`.
9. **Close stream.**

**Error codes (sent as SSE `event: error` with JSON body):**

| Code | `reason` field | UI behavior |
|---|---|---|
| `400` | `invalid_url` | "That URL doesn't look right — try again" |
| `401` | `unauthorized` | Redirect to `/auth/login` |
| `402` | `workspace_limit_reached` | Upgrade modal opens (Growth + Scale Stripe checkout buttons) |
| `412` | `needs_byok` | Inline form to paste Anthropic key, save, auto-retry creation |
| `422` | `extraction_failed` | "We couldn't read that site — paste a description instead" → fallback to manual form (deferred to a later spec; v1 just shows the error) |
| `500` | `internal_error` | "Something went wrong — try again" + Sentry alert |

**Test plan:**
- Unit: URL validator (5 cases: valid http, valid https, invalid scheme, missing TLD, whitespace)
- Unit: tier-limit branch (mock `enforceWorkspaceLimit` returning allowed/denied)
- Unit: BYOK precondition (key present, key empty string, key undecryptable)
- Unit: extraction parser (well-formed JSON, malformed, missing required fields)
- Integration: full SSE flow with mocked Anthropic SDK (assert event sequence + payload shapes)

### New frontend page

**File:** `packages/crm/src/app/(dashboard)/clients/new/page.tsx` (new)

Single-screen layout:
- Hero text: "Create your first client workspace"
- Subtext: "Paste your client's website URL and we'll build their CRM, booking page, intake form, and AI chatbot in under 60 seconds."
- Input: large URL field with autofocus, placeholder "https://your-client-business.com"
- Button: "Create workspace" (primary, large)
- Below: "or [skip and create one manually later]" (secondary link → `/dashboard`)

**Client component** (`clients-new-form.tsx`):
- On submit, open `EventSource` to the create endpoint
- Render a progress narration column on the right side of the form (or below on mobile):
  - "Fetching site..." → checkmark when `event: fetching` arrives
  - "Extracting business facts..." → checkmark on `event: extracting`
  - "Generating personality..." → checkmark on `event: soul_built`
  - "Building landing page..." → checkmark on `event: landing_built`
  - "Wiring up AI chatbot..." → checkmark on `event: chatbot_built`
  - "Seeding demo portal..." → checkmark on `event: demo_seeded`
- On `event: done` → `router.push(dashboardUrl)`
- On `event: error, code: 412` → swap form for inline BYOK prompt (`<input>` for key + "Save and continue" button → POSTs to existing `/settings/integrations/llm` save endpoint → on success, re-trigger create)
- On `event: error, code: 402` → open `<UpgradeModal>` component (defined in Cut B)
- On `event: error, code: 422` → show error banner, keep form filled in
- On `event: error, code: 500` → show error banner with "Try again" button

**Design checkpoints for this page:**
- Use `design:design-system` skill to confirm component selection from existing shadcn primitives (Input, Button, Card, Progress)
- Use `design:ux-copy` skill on every string (hero, subtext, placeholder, button label, all 6 progress narration phrases, all 5 error banners, BYOK prompt copy)
- Use `design:design-critique` skill on the full page after first implementation pass
- Use `design:accessibility-review` skill before merge — keyboard nav, screen reader announcements for progress events (`aria-live="polite"`), color contrast on progress checkmarks, focus trap on UpgradeModal

### Dashboard CTA

**File:** `packages/crm/src/app/(dashboard)/dashboard/page.tsx` (modify)

Add a prominent "Create Client Workspace" button to the dashboard header (top-right corner, primary color). Adjacent: a small workspace-usage badge ("1/3 workspaces" with tooltip "On Growth plan").

Click behavior:
- If under limit → navigate to `/clients/new`
- If at limit → open `<UpgradeModal>` (Cut B component)

The badge is a server component that calls `enforceWorkspaceLimit` to determine tier + count. Re-uses existing `getFreeTierUsageBannerData` patterns.

**Design checkpoints:**
- `design:design-system` for badge styling (existing usage banners as reference)
- `design:ux-copy` for "Create Client Workspace" button copy + tooltip
- `design:accessibility-review` for keyboard activation of the modal trigger

### Signup page

**File:** `packages/crm/src/app/(auth)/signup/page.tsx` (modify)
**File:** `packages/crm/src/app/(auth)/signup/signup-form.tsx` (modify)

Add a Google OAuth button above the email/password form:

```tsx
<button onClick={() => signIn("google", { callbackUrl: "/clients/new" })}>
  <GoogleIcon />
  Continue with Google
</button>
<div className="flex items-center gap-2 my-4">
  <hr className="flex-1" /> <span className="text-xs text-muted-foreground">OR</span> <hr className="flex-1" />
</div>
{/* existing email/password form, callbackUrl updated to /clients/new */}
```

Google provider is already wired in `packages/crm/src/lib/auth/config.ts`. No backend changes needed — just the button.

After successful signup, redirect to `/clients/new` (not `/onboarding/setup`).

**Design checkpoints:**
- `design:design-system` for OAuth button — use the official Google button styling (white background, Google "G" logo SVG, specific font)
- `design:ux-copy` for "OR" divider and "Continue with Google" label
- `design:accessibility-review` for keyboard nav between OAuth and email-form fields

### SetupWizard deletion

**Files to delete:**
- `packages/crm/src/app/(onboarding)/setup/page.tsx` and adjacent components
- Any references in route configs

**Files to keep:** `(onboarding)/welcome/` — keep as-is. It's a post-signup celebration screen that may still be reachable via existing redirects; out of scope for this pivot. A future spec can decide whether to delete or repurpose.

Update all redirects pointing to `/onboarding/setup` to point to `/clients/new` instead. Grep for `onboarding/setup` across the repo to find them all.

### Cut A total estimate

- New code: ~700 LoC source
- Test code: ~300 LoC
- Files touched: ~12 (1 migration, 1 new endpoint, 2 new frontend files, 1 dashboard modify, 2 signup modifies, 1 onboarding delete + route redirect updates, schema type files)

---

## Cut B — Clients view + tier-gating + billing (Week 3-4)

### New `/clients` page

**File:** `packages/crm/src/app/(dashboard)/clients/page.tsx` (new)

Server component. Renders:
- Header: "Your Clients" + usage badge ("X/Y workspaces") + primary "Create Client Workspace" button (same gating as dashboard)
- Empty state: large illustration + "No clients yet — let's create your first one" + same CTA
- Card grid (3-col desktop, 2-col tablet, 1-col mobile):
  - Each card: workspace name (large), public URL (link), status badge (active/setup/paused), contact count ("12 contacts"), last activity timestamp ("Active 3 hours ago"), pipeline summary ("2 new leads this week"), "Open dashboard" button

### New backend endpoint

**File:** `packages/crm/src/app/api/v1/web/workspaces/mine/route.ts` (new)

```
GET /api/v1/web/workspaces/mine
Auth: session cookie
Response: { workspaces: WorkspaceSummary[], tier, used, limit }

type WorkspaceSummary = {
  id: string;
  slug: string;
  name: string;
  publicUrl: string;
  dashboardUrl: string;
  status: "active" | "setup" | "paused";
  contactCount: number;
  lastActivityAt: string | null;  // ISO timestamp
  newLeadsThisWeek: number;
};
```

Query: `organizations` joined to `orgMembers` filtered by `userId`, with subqueries for `contactCount` + `lastActivityAt` + `newLeadsThisWeek` rolled up per org.

### Upgrade modal component

**File:** `packages/crm/src/components/billing/upgrade-modal.tsx` (new)

Reusable modal. Triggered from: dashboard CTA (Cut A), `/clients` CTA, `/clients/new` 402 error.

Layout:
- Title: "You've used all your workspaces on Free"
- Subtext: dynamic — "You're on Free with 1 of 1 workspaces used. Upgrade to add more clients."
- Two side-by-side tier cards:
  - **Growth** ($29/mo): 3 workspaces, custom domain per client, no SeldonFrame branding, client portal access. "Upgrade to Growth" button.
  - **Scale** ($99/mo): Unlimited workspaces, AI agents (Speed-to-Lead, Win-Back, Review Requester), full white-label client portal, priority support. "Upgrade to Scale" button.
- Below cards: "Both tiers include unlimited contacts, unlimited bookings, BYOK Anthropic key support, and access to the Claude Code MCP power-user path."
- "Maybe later" closes modal.

Click on either upgrade button → POSTs to existing `/api/stripe/checkout` route (the canonical signed-in-user Stripe checkout flow at `packages/crm/src/app/api/stripe/checkout/route.ts`) → receives Stripe checkout URL → opens in same window. After successful payment, the existing Stripe webhook at `/api/stripe/webhook` updates `org.subscription.tier` atomically, user returns to `/dashboard?upgraded=growth` (success banner). The endpoint already accepts a `priceId` and tier — pass the Growth or Scale `priceId` from `lib/billing/price-ids.ts`.

**Design checkpoints:**
- `design:design-system` for tier card styling — must feel premium, not pushy
- `design:ux-copy` on every line of copy — value-forward, not feature-list-dump
- `design:design-critique` after first pass — does it convert?
- `design:accessibility-review` — focus trap, ESC key closes, screen reader reads tier comparison logically

### Tier features table

| Feature | Free | Growth ($29) | Scale ($99) |
|---|---|---|---|
| Workspaces | 1 | 3 | Unlimited |
| BYOK Anthropic key | ✓ | ✓ | ✓ (or managed key) |
| Unlimited contacts per workspace | ✓ | ✓ | ✓ |
| SeldonFrame branding hidden | — | ✓ | ✓ |
| Custom domain per client | — | ✓ | ✓ |
| Client portal access | — | ✓ | ✓ |
| AI agents (Speed-to-Lead, Win-Back, Review Requester) | — | — | ✓ |
| Full white-label client portal | — | — | ✓ |
| Priority support | — | — | ✓ |
| Claude Code MCP access | ✓ | ✓ | ✓ |

This table is the single source of truth for tier-gating logic. Each `—` corresponds to a feature flag check at the relevant code path. The flag-check helper `hasFeature(orgId, featureName)` (extend existing `lib/billing/features.ts`) keeps gating in one place. Feature flag names (enum):

- `branding_hidden` — gated on Growth+
- `custom_domain` — gated on Growth+
- `client_portal` — gated on Growth+
- `ai_agents` — gated on Scale only
- `white_label_portal` — gated on Scale only
- `priority_support` — gated on Scale only

Each gate consumer (e.g. the custom-domain settings page, the AI agents dashboard panel) calls `hasFeature(orgId, "custom_domain")` and either renders the feature OR renders an inline upgrade card pointing at the upgrade modal.

### Settings: `/settings/agency-profile` page

**File:** `packages/crm/src/app/(dashboard)/settings/agency-profile/page.tsx` (new)

Form for editing the `users.agency_profile` JSONB:
- Agency name (text input, required)
- Agency logo (image upload via existing primitive — reuse `upload_workspace_image` pattern but scope to user)
- Brand color (color picker, hex)
- Agency website URL (URL input, optional)

Save action updates `users.agency_profile` row. No org touched.

**Design checkpoints:**
- `design:design-system` for form layout — match existing settings page patterns
- `design:ux-copy` for field labels + help text
- `design:accessibility-review` — color picker needs hex-input fallback for screen readers, logo upload needs alt-text field

### Cut B total estimate

- New code: ~500 LoC source
- Test code: ~250 LoC
- Files touched: ~8 (2 new pages, 1 new endpoint, 1 new shared component, 1 features.ts extension, 3 modifies to existing surfaces that use the new component)

---

## Cut C — Marketing site rebuild (Week 5-6)

### Scope

Refresh the existing marketing site at `packages/crm/src/app/(public)/page.tsx` (renders `landing-client.tsx`). Don't rewrite from scratch — the current page is already agency-positioned. Replace sections, refresh copy, add net-new sections.

### Section-by-section changes

**Hero:**
- Old: existing hero copy (review during implementation)
- New: "The open-source Business OS your agency builds for clients in 60 seconds" (subject to `design:ux-copy` skill refinement)
- Primary CTA: "Sign Up Free" → `/auth/signup`
- Secondary CTA: "Continue in Claude Code →" → `/docs/claude-code-mcp` (preserves power-user positioning, signals dual-path product)
- Hero visual: looped 6-second screencap of "paste URL → workspace appearing" (Loom-style)

**New section: "How it works"** (3-column on desktop, stacked on mobile)
1. **Sign up free** — Google OAuth or email. 30 seconds. (Screenshot of signup form)
2. **Paste your client's URL** — We extract their business, services, hours, reviews automatically. (Screenshot of `/clients/new` mid-extraction)
3. **Workspace ready in 60 seconds** — CRM, booking page, intake form, AI chatbot, demo portal — all pre-wired. (Screenshot of new workspace dashboard)

**New section: "Demo video"**
- 60-second screen recording of the full flow (signup → paste URL → workspace ready → chatbot conversation → client portal demo)
- Production: record after Cut A ships and we can capture the real flow
- Week 5 ships with a 6-second animated GIF placeholder
- Week 6 swaps in the polished video

**New section: "Pricing"**
- Three columns: Free / Growth $29 / Scale $99
- Use the tier features table from Cut B verbatim
- Each column has a CTA: Free → "Sign Up Free", Growth → "Start free trial", Scale → "Start free trial"

**New section: "Built for agencies, MIT-licensed"**
- "Self-host SeldonFrame with `docker compose up`, or use SeldonFrame Cloud."
- GitHub stars badge (live count from GitHub API)
- Three icons + labels: "AGPL-3.0 licensed", "MCP-native", "Fully extensible"
- Link to GitHub repo

**Refreshed FAQ:**
Replace SMB-owner-oriented questions with agency-oriented ones:
- "Can I white-label this for my clients?" → Yes on Growth+, full white-label on Scale
- "What if my client wants their own domain?" → Custom domain per workspace on Growth+
- "Does it work with my existing Anthropic API key?" → Yes, BYOK on all tiers
- "How many client workspaces can I create?" → 1 Free, 3 Growth, unlimited Scale
- "Can I use Claude Code instead of the web?" → Yes, both paths share the same backend
- "Is my client data isolated between workspaces?" → Yes, each workspace is an independent org with full data isolation

**Footer:**
- Prominent GitHub link
- Existing links: /privacy, /terms, /pricing, /docs, /blog, /demo

### Design treatment

This is the highest-stakes UI work in the entire pivot. Every section must invoke design skills:
- `design:design-system` for visual hierarchy + spacing + color palette
- `design:ux-copy` on EVERY string — hero, subtitles, section heads, FAQ Q&A, footer
- `design:design-critique` after each major section lands
- `design:accessibility-review` before final ship — color contrast, reduced motion for the hero video, alt text on all screenshots, keyboard nav through pricing cards

### Cut C total estimate

- New code: ~600 LoC (mostly JSX + copy)
- Test code: ~100 LoC (component renders + snapshot)
- Demo video: ~3-4 hours of recording + editing in week 6

---

## UI design standards (applies to all 3 Cuts)

The user explicitly required Claude design skills be applied to every UI surface. This is non-negotiable and called out per-surface above. Summary of the design skill family and when to invoke each:

| Skill | When |
|---|---|
| `design:design-system` | Before implementing each new page/component — confirm component selection from existing shadcn primitives, ensure design tokens (color, spacing, typography) are used consistently |
| `design:ux-copy` | Every user-facing string — hero copy, button labels, error messages, empty states, tooltips, progress narration |
| `design:design-critique` | After first implementation pass of each page/section — independent review for usability, hierarchy, conversion |
| `design:accessibility-review` | Before merging each new page — WCAG 2.1 AA compliance, keyboard nav, screen reader, color contrast |
| `design:design-handoff` | Optional — generate dev specs from a design if any designer mockups come in |

**Process integration:** The implementation plan (written next via `superpowers:writing-plans`) MUST include design skill invocations as explicit tasks. Example task structure:
```
Task N.5: Design pass on /clients/new
  - Invoke design:design-system to audit component choices
  - Invoke design:ux-copy to refine all 14 strings
  - Invoke design:design-critique for UX review
  - Apply fixes inline
Task N.6: Accessibility pass on /clients/new
  - Invoke design:accessibility-review
  - Fix any WCAG violations
```

---

## Sequencing and validation gates

| Week | Ships | Validates |
|---|---|---|
| 1 | Cut A backend: schema migration + endpoint + extraction loop + tests | curl test: end-to-end workspace creation from URL succeeds |
| 2 | Cut A frontend: `/clients/new` + Google OAuth on signup + dashboard CTA | Manual: full web signup → first workspace creation → land in workspace dashboard |
| 3 | Cut B `/clients` page + `/api/v1/web/workspaces/mine` endpoint + agency-profile settings | Manual: agency with 3 workspaces sees them all on `/clients` |
| 4 | Cut B upgrade modal + Stripe integration polish + tier-features helper | Manual: Free → Growth upgrade flow completes, tier change reflected in UI |
| 5 | Cut C copy refresh + How It Works + pricing table + FAQ + footer | Manual: marketing site converts (without demo video yet) |
| 6 | Cut C demo video + final design pass on every surface | Demo video uploaded; full pivot end-to-end smoke test |

**Decision gate after Week 6:** Observe 4 weeks of organic + paid traffic. Metrics:
- Signup conversion from `seldonframe.com` (signups / unique visitors)
- Workspace creation rate (% of signups who create their first workspace)
- Upgrade conversion (% of users who hit Free limit, of those % who upgrade)
- Time-to-first-workspace (signup → first workspace ready, p50)

If signup conversion < 2% or workspace creation rate < 40%, the pivot needs marketing/messaging refinement (Cut D — not yet specced). If both above thresholds, build the agency-as-parent-org features (parent-child hierarchy, agency-level reporting, team invites) in a follow-up spec.

---

## Out of scope (deferred to future specs)

1. **Claude Code MCP token auth** — Connecting a web-signed-up account to Claude Code via API token so the same account works in both surfaces. ~1 week of its own work (token issuance UI, rotation, dashboard for listing/revoking tokens, MCP-side auth update). Defer to week 7+.
2. **Manual workspace creation fallback** — Form-based fallback when `extraction_failed` (422). v1 just shows the error; a future spec adds the form-with-optional-URL path.
3. **Agency-as-parent-org schema** — Real parent-child relationship in `organizations` with agency-level reporting. Defer until web onboarding validates the agency hypothesis.
4. **Team invites within an agency** — Multi-user agencies where the owner invites teammates to access all client workspaces. Defer.
5. **Usage-based billing for contacts/agent-runs beyond tier caps** — Already partially wired (`enforceContactLimit`, `enforceAgentRunLimit`) but the metered-overage UX doesn't exist yet. Defer to a separate billing spec.
6. **White-label customization beyond logo/color/domain** — Custom CSS, custom email templates per agency, etc. Defer.
7. **Workspace duplication** — "Create new client workspace from existing template" — useful for agencies with similar verticals. Defer.
8. **Multi-language marketing site** — English only at launch.

---

## Open implementation questions (recommended defaults pre-decided)

1. **Where exactly the agency profile JSONB lives:** `users.agency_profile` column (recommended) vs. a separate `agency_profiles` table 1:1 with users. **Default: JSONB column on users.** Simpler, no join, fine for the field count we expect (~6 fields).
2. **Image upload for agency logo:** reuse the existing `upload_workspace_image` primitive scoped to user (not org), or build a new `upload_user_image`. **Default: extend existing primitive with a `scope: "user"` parameter** to avoid duplicating R2/S3 plumbing.
3. **SSE timeout for the create endpoint:** how long does the connection stay open if Anthropic is slow? **Default: 90 seconds.** If the extraction + createFullWorkspace takes longer, the SSE closes with `event: error, code: 504` and the frontend offers "Try again."
4. **Workspace switcher fate:** Cut B introduces `/clients` as the canonical management surface. Does the workspace switcher in the dashboard nav stay? **Default: yes, stays.** Switcher is for in-context navigation between workspaces; `/clients` is for management.

---

## Test plan summary

| Cut | Unit tests | Integration tests | E2E tests |
|---|---|---|---|
| A | ~15 | ~3 (SSE flow, Anthropic mock, createFullWorkspace integration) | 1 (manual: signup → first workspace) |
| B | ~10 | ~2 (workspaces/mine query, upgrade modal Stripe flow) | 1 (manual: upgrade flow Free → Growth) |
| C | ~5 (component snapshot tests) | 0 | 1 (manual: signup CTA from landing converts) |

Total new tests: ~36, mostly unit tests. Existing pre-existing failing tests on origin/main (workflow-event-log, block-codegen-staleness, SLICE 9 archetype-isolation, theme integration) remain unrelated to this pivot.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Anthropic `web_fetch` tool fails on JS-heavy SPAs or anti-bot pages | The same extraction-instructions playbook used by Claude Code handles fallbacks ("if all 3 fetches fail, fall back to operator dialog"). For web, the dialog becomes the manual form (deferred to a future spec) — v1 just surfaces the 422 error. |
| Operator pastes a key that's out of credits → `llm_credit_exhausted` mid-extraction | The endpoint catches the Anthropic error and closes the stream with `event: error, code: 402, reason: "credits_exhausted"`. Frontend shows "Your Anthropic key is out of credits — top it up at console.anthropic.com." |
| Stripe webhook arrives late, user upgrades but UI still shows old tier | Existing webhook flow already updates `org.subscription.tier` atomically. UI server-rendered, will reflect on next navigation. If user reports stale tier, they can hit `/settings/billing/refresh` (already exists). |
| Demo video chicken-and-egg: can't record until Cut A works | Sequenced: Week 5 ships marketing with placeholder, Week 6 records and swaps. |
| Free tier abuse (one person creates 100 accounts to get 100 free workspaces) | Each account requires email verification + their own Anthropic key. Effort to create 100 accounts >> value of 100 trial workspaces. Accept this risk for v1; revisit if abuse materializes. |
| `web_fetch` Anthropic tool maturity — relatively newer feature | Mitigation: test against 10+ representative business sites during Week 1 (HVAC, dental, medspa, plumbing, etc.). If reliability < 90%, fall back to Playwright (Option C from the brainstorm) as a hot-swap. |

---

## Next step

User reviews this spec. If approved → invoke `superpowers:writing-plans` to produce 3 sub-plans (one per Cut), each containing bite-sized tasks per the writing-plans methodology. Each sub-plan will explicitly include the design-skill invocations as tasks, not as afterthoughts.

**Recommended worktree:** Fresh worktree off origin/main named `seldonframe-web-onboarding-pivot` (current worktree `agency-output-product-moment` belongs to the already-shipped v1.55/1.56 work).
