# Redesign the agency operator's post-creation output — make it a product moment

**Date**: 2026-05-15
**Status**: Approved design; ready for implementation plan
**Brainstorm source**: live session with maximehoule100@gmail.com
**Predecessor context**: [2026-05-14-pull-firecrawl-out-of-backend-design.md](2026-05-14-pull-firecrawl-out-of-backend-design.md) created the lean URL flow that bypassed v1.51's auto-chatbot + tier-upsell features. This spec restores them on the new flow + redesigns the operator-facing summary.

## Motivation

After ~8 minutes of workspace creation, the agency operator (the actual customer — agencies/freelancers selling to SMBs) sees a config-receipt summary in their Claude Code session:

```
✅ Quigley Heating & Air's Business OS is live.
📧 Welcome email sent to maximehoule100@gmail.com.
🌐 Public URLs: Website / Booking / Intake
🔐 Admin dashboard: ...
What's configured: HVAC personality, light theme, blocks, hours, intake fields, pipeline
Let me know if you want to swap motion preset, apply a DESIGN.md, or tweak any block's copy.
```

This communicates "we made a website + admin." It does not communicate the pitch SeldonFrame actually sells: **"CRM. Booking. Intake. AI chatbot. Already wired. Deploy per client in 3 minutes. The open-source GoHighLevel alternative for agencies."**

Specifically missing:
- **No chatbot.** The auto-chatbot feature (added in v1.51 to `/api/v1/workspaces/create-full`) doesn't fire on the new lean URL flow. The agency's wedge feature is silently absent.
- **No client portal URL.** The portal at `/customer/<slug>/login` exists but the operator is never told about it. The Growth-tier upsell hook is invisible.
- **No tier ladder.** Operators don't know what they have vs. what unlocks at Growth ($29/mo) and Scale ($99/mo).
- **No agency framing.** "Your workspace" instead of "Your client's business OS." "Optional upgrades" listing technical tools instead of agency-meaningful next actions.

The "operator output moment" is Stage 2 of the agency customer's journey and the single highest-leverage product surface: it's where they decide whether SeldonFrame delivered on the pitch.

## Goals

- The post-creation output speaks to an **agency delivering for their SMB client**, not to a workspace owner.
- All four pillars of the pitch are visible and actionable: **Website, Booking, Intake, AI chatbot** — each with its own URL + concrete next action.
- The **client portal URL** is shown to every operator (free or paid) with clear tier-gating framing.
- A **tier ladder** is always visible so operators see the upgrade path before hitting a paywall.
- The **chatbot embed snippet** is ready to paste; the embed snippet is the agency's deliverable to ship onto the client's existing site.
- An **iteration menu** with 5 agency-meaningful examples replaces the current technical "Optional upgrades" list.

## Non-goals

- Real billing-state read (`currentTier` stays hardcoded to `"free"` until a separate spec wires billing).
- Vertical-aware iteration menu (HVAC-specific vs. dental-specific suggestions — Phase-2 polish).
- Landing-page visual quality improvements (separate spec; this one only touches the operator summary).
- Mid-creation progress narration during `persist_block` (out of scope).
- Live chatbot publishing flow (the chatbot ships in test mode; publishing path unchanged).
- Soul-derived FAQ population (chatbot scaffold ships with `faq: []`; operator refines via `update_website_chatbot`).

## Architecture

### Before (today, after the firecrawl-removal spec)

```
Claude → create_workspace_from_url → playbook
Claude → WebFetch + extract + dialog
Claude → create_workspace_v2 → shell + recommended_blocks
Claude → for each block: get_block_skill + persist_block
Claude → complete_workspace_v2
   ↓ returns { ok, workspace_id, public_url, blocks, next_steps }
   ↓ NO chatbot created. NO portal URL. NO tier info.
Claude → finalize_workspace (asks for email)
   ↓ MCP handler fetches snapshot, sends welcome email, captures lead
   ↓ builds summary: ✅ / URLs / admin / "What's configured" /
     "Optional upgrades" (motion preset / DESIGN.md / handoff bundle)
   ↓ returns { ok, summary, urls, admin_url, … }
Claude paraphrases summary to operator.
```

### After

```
Claude → create_workspace_from_url → playbook  (unchanged)
Claude → WebFetch + extract + dialog            (unchanged)
Claude → create_workspace_v2                    (unchanged)
Claude → for each block: get_block_skill + persist_block  (unchanged)
Claude → complete_workspace_v2
   ↓ NEW: server creates a website-chatbot agent (empty FAQ scaffold)
   ↓ returns { …existing, chatbot_agent_id, chatbot_embed_url, chatbot_embed_snippet }
Claude → finalize_workspace (asks for email)
   ↓ MCP handler fetches snapshot with NEW fields:
       chatbot, tier, booking, intake (derived summaries)
   ↓ Sends welcome email + captures lead (unchanged)
   ↓ NEW: builds Approach-A summary (agency framing, 8 sections)
   ↓ returns { …existing, chatbot_*, client_portal_url, current_tier, tier_features }
Claude paraphrases summary to operator.
```

### Invariants

- **Chatbot creation is a soft-fail step.** If `createAgent` throws, `/v2/complete` returns 200 with `chatbot_agent_id: null`. The summary then shows a "scaffold pending, retry create_agent" line. Never blocks workspace creation.
- **Portal URL is always returned in the snapshot**, regardless of tier. The tier field gates whether the summary frames it as "🔒 Growth tier unlocks" or "✅ active — forward to your client."
- **Tier is hardcoded to `"free"` today.** Replaced by real billing-state read in a separate spec.
- **Welcome email, lead capture, admin URL flow are unchanged.**
- **Idempotency on `/v2/complete`**: if a website-chatbot agent already exists for the workspace, return its IDs instead of creating a second.

## Components

### 5a. Backend: `complete_workspace_v2` — auto-chatbot creation

**File:** `packages/crm/src/app/api/v1/workspace/v2/complete/route.ts`

After the existing block inventory, before the existing `return`:

```typescript
// 2026-05-15 — auto-chatbot draft. Every v2 workspace ships with a
// website-chatbot scaffold so finalize_workspace's summary can give the
// operator the embed snippet immediately. Soft-fail: if createAgent
// throws, return null fields and let the operator retry via create_agent.
let chatbotAgentId: string | null = null;
let chatbotEmbedUrl: string | null = null;
let chatbotEmbedSnippet: string | null = null;

// Idempotency: a v2/complete retry shouldn't create a second chatbot.
const [existing] = await db
  .select({ id: agents.id, embedToken: agents.embedToken })
  .from(agents)
  .where(
    and(eq(agents.orgId, workspaceId), eq(agents.archetype, "website-chatbot"))
  )
  .limit(1);

if (existing) {
  chatbotAgentId = existing.id;
  chatbotEmbedUrl = `${APP_BASE}/embed/${existing.embedToken}.js`;
  chatbotEmbedSnippet = `<script src="${chatbotEmbedUrl}" async></script>`;
} else {
  try {
    const agentResult = await createAgent({
      orgId: workspaceId,
      archetype: "website-chatbot",
      channel: "web_chat",
      name: `${org?.name ?? "Website"} Chatbot`,
      faq: [],
    });
    if (agentResult.ok) {
      chatbotAgentId = agentResult.agent.id;
      chatbotEmbedUrl = agentResult.embedUrl;
      chatbotEmbedSnippet = `<script src="${agentResult.embedUrl}" async></script>`;
    }
  } catch (err) {
    logEvent(
      "v2_auto_chatbot_failed",
      { error: err instanceof Error ? err.message : String(err) },
      { request, orgId: workspaceId, severity: "warn" }
    );
  }
}

return NextResponse.json({
  ok: true,
  workspace_id: workspaceId,
  public_url: publicUrl,
  blocks: { expected, persisted, missing },
  chatbot_agent_id: chatbotAgentId,
  chatbot_embed_url: chatbotEmbedUrl,
  chatbot_embed_snippet: chatbotEmbedSnippet,
  next_steps: /* existing branching unchanged */,
});
```

Imports to add: `import { createAgent } from "@/lib/agents/store";` and `import { agents } from "@/db/schema";` (verify `logEvent` is already imported).

The exact field names (`embedToken`, `APP_BASE`) need to be confirmed against the actual `agents` schema and `createAgent` implementation at task time.

### 5b. Backend: snapshot endpoint — expose new fields

**File:** `packages/crm/src/app/api/v1/workspace/[id]/snapshot/route.ts` (verify exact path at task time)

Additions to the response (existing fields unchanged):

```typescript
{
  // …existing fields…

  // NEW: chatbot info — null if no website-chatbot agent exists yet
  chatbot: {
    agent_id: string;
    embed_url: string;
    embed_snippet: string;
    status: "test" | "live";
    name: string;
  } | null;

  // NEW: tier info — always populated (defaults to free)
  tier: {
    current_tier: "free" | "growth" | "scale";
    current_tier_label: "Free" | "Growth" | "Scale";
    client_portal_url: string;
    client_portal_status: "locked" | "available";
    tier_features: { free: string[]; growth: {…}; scale: {…} };
    upsell_hint: string;
  };

  // NEW: derived summary helpers
  booking: {
    duration_minutes: number;
    hours_summary: string;  // e.g. "Mon-Fri 7-5, Sat 8-12"
  } | null;
  intake: {
    field_count: number;
    title: string | null;
  } | null;
}
```

Implementation:
- `chatbot` — query the `agents` table for the org's website-chatbot row.
- `tier` — call existing `buildTierUpsell({ slug, currentTier: "free" })` from `lib/workspace/tier-upsell.ts`. Add a derived `current_tier_label` field.
- `booking` — call new `summarizeWeeklyHours(metadata.availability)` helper. Read `duration_minutes` from `bookings.metadata`.
- `intake` — count fields from `intakeForms.fields` (JSON array length).

### 5c. New helper: `summarizeWeeklyHours`

**File:** `packages/crm/src/lib/workspace/format-hours.ts` (~30 lines, pure function)

```typescript
type DayName = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
type DaySpec = { enabled: boolean; start: string; end: string };
type WeeklyHours = Partial<Record<DayName, DaySpec>>;

/**
 * Compact human-readable summary of a weekly availability map.
 * Examples:
 *   Mon-Fri 07:00-17:00            → "Mon-Fri 7-5"
 *   Mon-Fri 09-17, Sat 08-12       → "Mon-Fri 9-5, Sat 8-12"
 *   Mon, Wed, Fri 9-17 (gaps)      → "Mon, Wed, Fri 9-5"
 *   no enabled days                → "by appointment"
 */
export function summarizeWeeklyHours(hours: WeeklyHours): string {
  // …implementation grouping contiguous days into runs by (start, end) tuple,
  //   formatting hours as 12h labels without leading zeros, joining runs with ","…
}
```

Pure function, easy to unit-test.

### 5d. MCP handler: `finalize_workspace` summary rewrite

**File:** `skills/mcp-server/src/tools.js`, around lines 814-980.

The handler's snapshot/email/lead-capture flow stays. Only the `lines = [...]` array (which builds the `summary` string) and the return shape change.

The exact summary string template is specified in §"Summary string" below.

The return shape adds new fields:

```javascript
return {
  ok, summary, workspace, website_url, booking_url, intake_url, admin_url,
  email_sent, email_error, lead_recorded, lead_id, lead_error,
  personality, pipeline_stages,
  // NEW:
  chatbot_agent_id, chatbot_embed_url, chatbot_embed_snippet, chatbot_status,
  client_portal_url, client_portal_status, current_tier, tier_features,
  next_steps_available: [/* 6 new agency-meaningful actions */],
};
```

The `next_steps_available` array entries change from the current 4 (motion / DESIGN.md / handoff / update_landing_content) to:

1. `publish_agent` — when operator is ready to take chatbot live
2. `update_website_chatbot` — refine FAQ before publishing
3. `install_archetype` — wire pre-built automations (missed-call-text-back, etc.)
4. `customize_block` — refine landing-page hero / services with brand voice
5. `connect_integration` — Google Calendar, Stripe, Twilio
6. `configure_llm_provider` — swap from Claude Code key to a different Anthropic key

The MCP tool's `description` field gains one line acknowledging agency framing:

> "The summary is agency-voice: addresses the operator AS an agency delivering for their SMB client, not as the workspace owner. When relaying to the operator, preserve the 'your client' framing throughout — don't rewrite to 'your workspace'."

### Version bump

`skills/mcp-server/package.json`: `1.52.0` → `1.53.0`. MINOR — output format changes (new structured fields + new summary copy), no breaking input-schema changes.

## The summary string

The literal text the MCP handler builds and Claude paraphrases. Variables in `{curly braces}` get substituted from the snapshot.

```
✅ {business_name} — client OS shipped in {duration}.

Your client's stack is wired and live:

🌐 Public site (paste a screenshot in your Slack)
   {public_urls.home}

🤖 AI chatbot — paste on the client's existing site (before </body>):
   <script src="{chatbot_embed_url}" async></script>
   In TEST mode. Powered by your Claude Code key (swap in settings).
   Publish live: publish_agent({ agent_id: "{chatbot_agent_id}", status: "live" })

📋 Booking page (client's customers self-serve appointments)
   {public_urls.book}

📝 Intake form ({intake_field_count}-question {intake_title})
   {public_urls.intake}

🔐 Your admin (CRM, pipeline, leads, deals)
   {admin_url}

👥 Client portal (your client logs in here to see their leads + bookings)
   {client_portal_url}
   🔒 Growth tier ($29/mo) unlocks this for your client. Preview it
       yourself at the URL above right now.

What's wired:
   • {personality_label} personality • {pipeline_stage_count}-stage CRM pipeline
   • {booking_hours_summary} bookings, {booking_duration}-min slots
   • {intake_field_count}-question intake with {intake_special_note}
   • AI chatbot trained on the homepage (FAQ scaffold ready to refine)
   • Welcome email + admin link sent to {operator_email}

What you can prompt next:
   • "Refine the chatbot FAQ from the site" → update_website_chatbot
   • "Add SMS missed-call-text-back automation" → install_archetype
   • "Customize the hero with the client's brand voice" → customize_block
   • "Wire Google Calendar so bookings sync" → connect_integration
   • "Add a Spanish version of the landing page" → clone_workspace + translate

Tier ladder (you're on Free):
   Free  → 1 client workspace, everything above wired
   Growth $29/mo → 3 workspaces, client portal goes live, custom domain
                   (e.g. crm.youragency.com), SMS/email automations
   Scale $99/mo → unlimited workspaces, full white-label, reseller pricing

Forward your client this admin link when ready. Or stay here and iterate.
```

### Branching rules

**If `chatbot_agent_id` is null** (auto-chatbot soft-failed in `/v2/complete`):

```
🤖 AI chatbot — scaffold pending. Retry:
   create_agent({ archetype: "website-chatbot", channel: "web_chat" })
```

**If `current_tier` is `growth` or `scale`** (paid):

```
👥 Client portal (your client logs in here)
   {client_portal_url}
   ✅ Active. Forward this URL to your client; they log in via magic email.
```

Drops the 🔒 "Growth tier unlocks" line.

**If `current_tier` is `scale`**: omit the tier-ladder section entirely (already at top — no upsell to show).

### Variable sourcing

| Variable | Source |
|---|---|
| `business_name` | `snapshot.workspace.name` |
| `duration` | computed in MCP handler from `Date.now() - sessionStart` |
| `public_urls.{home,book,intake}` | `snapshot.public_urls` (existing) |
| `chatbot_embed_url`, `chatbot_agent_id` | NEW from snapshot — `snapshot.chatbot.{embed_url,agent_id}` |
| `admin_url` | computed from `appHost + /admin/{id}?token={bearer}` (existing) |
| `client_portal_url` | NEW from snapshot — `snapshot.tier.client_portal_url` |
| `personality_label` | `snapshot.workspace.settings.crmPersonality.vertical` capitalized (existing) |
| `pipeline_stage_count` | `pipelineStages.length` (existing) |
| `intake_field_count`, `intake_title` | NEW from snapshot — `snapshot.intake.{field_count,title}` |
| `booking_hours_summary`, `booking_duration` | NEW from snapshot — `snapshot.booking.{hours_summary,duration_minutes}` |
| `intake_special_note` | NEW — `"emergency-line fallback"` for hvac/plumbing; `"structured lead-qualification"` otherwise |
| `current_tier_label` | NEW from snapshot — `snapshot.tier.current_tier_label` |
| `operator_email` | the `email` arg passed to `finalize_workspace` |

## Testing

### Unit: `format-hours.spec.ts`

```typescript
test("Mon-Fri 07-17 collapses to 'Mon-Fri 7-5'");
test("Mon-Fri + Sat with different hours formats with comma");
test("non-contiguous days fall back to enumeration");
test("empty availability returns 'by appointment'");
```

### Unit (optional): snapshot endpoint shape

Verifies the snapshot returns the new fields. If DB-dependent, fold into the existing `cross-block-smoke.ts` pattern.

### Manual smoke (canonical verification)

In a fresh Claude Code session post-deploy: `create workspace for https://quigleyac.com`. Then verify against the §"Definition of done" checklist below.

## Migration / rollout

1. Add helper: `lib/workspace/format-hours.ts` + unit tests
2. Modify snapshot route: add chatbot / tier / booking / intake summary fields
3. Modify `/v2/complete` route: add auto-chatbot creation (with idempotency check)
4. Modify `finalize_workspace` MCP handler: rewrite summary string + return shape
5. Bump MCP version 1.52.0 → 1.53.0
6. Commit + push branch
7. Merge to main → Vercel auto-deploys backend
8. `npm publish @seldonframe/mcp@1.53.0`
9. Manual smoke against prod against the §"Definition of done" checklist
10. 12-24h soak watching logs for `v2_auto_chatbot_failed`

Steps 1-2 are additive backend (zero behavior change). Step 3 introduces auto-chatbot (new side effect). Step 4 is the MCP-side rewrite. Steps 5-8 ship. Steps 9-10 verify.

### Backward compatibility

- **Old MCP clients (< 1.53)** continue using the old handler + see the old summary. The backend changes work for them but don't surface until they upgrade.
- **Old backend + new MCP** (theoretically): MCP handler reads `snapshot.chatbot`, `snapshot.tier` which would be undefined → branches gracefully (chatbot soft-fail line; portal section skipped). Degraded but doesn't crash.

### Rollback

Code-only. Revert the merge commit + `npm deprecate @seldonframe/mcp@1.53.0`. No data state to undo (the auto-created chatbot agents remain valid `agents` rows).

## Definition of done

Manual smoke checklist against `create workspace for https://quigleyac.com`:

- [ ] `✅ Quigley Heating & Air — client OS shipped in Nm Ns.` header line, agency framing
- [ ] 🌐 Public site URL shown
- [ ] 🤖 Chatbot embed snippet shown: `<script src="…" async></script>`
- [ ] 🤖 "In TEST mode. Powered by your Claude Code key" footer
- [ ] 🤖 `publish_agent({ agent_id: "ag_…" })` example with REAL agent ID
- [ ] 📋 Booking URL shown
- [ ] 📝 Intake URL shown with field count + form title
- [ ] 🔐 Admin URL shown
- [ ] 👥 Client portal URL shown with 🔒 Growth tier lock note (free tier)
- [ ] "What's wired" block: personality, pipeline-stages, hours-summary, intake-special-note, chatbot mention, email status
- [ ] "What you can prompt next" block: 5 agency-meaningful examples
- [ ] "Tier ladder (you're on Free)" with Free / Growth / Scale unlocks
- [ ] "Forward your client this admin link when ready" closer

Structural / log assertions:

- [ ] Vercel logs show `v2_workspace_completed` with chatbot_agent_id populated
- [ ] No `v2_auto_chatbot_failed` events for the test workspace
- [ ] DB has exactly one `agents` row for the workspace with `archetype="website-chatbot"`
- [ ] Public landing page URL renders correctly (regression check)
- [ ] `pnpm test:unit` is green for `format-hours.spec.ts`
- [ ] `@seldonframe/mcp@1.53.0` published to npm + MCP Registry

## Out of scope (deferred)

1. **Real billing-state read.** `currentTier` is hardcoded to `"free"` in `buildTierUpsell({ currentTier: "free" })`. Replacing with `organizations.plan` requires billing-detection plumbing — separate spec.
2. **Vertical-aware iteration menu.** The 5 "What you can prompt next" examples are the same for every vertical. Vertical-aware (HVAC-specific, dental-specific, etc.) is Phase-2 polish.
3. **Default landing-page visual quality.** Generic hero imagery, weak Unsplash fallback, no emergency banner for HVAC — separate brainstorm.
4. **`customize_block` response design.** This spec only touches `finalize_workspace`'s summary.
5. **Intermediate progress narration during `persist_block`.** The mid-creation experience improvement is a separate spec.
6. **Live chatbot publishing flow.** This spec ships the chatbot in TEST mode. Publishing path unchanged from today.
7. **Soul-derived FAQ population.** The auto-chatbot ships with `faq: []`. Future iteration could populate from soul/scraped content.
8. **Old "Optional upgrades" prompts (motion-preset, DESIGN.md, handoff-bundle).** Still callable as tools; just not surfaced in the new summary. If the operator wants them, they prompt and Claude calls them.

## Successor specs (likely worth doing eventually)

- **Real billing-state read** for the tier ladder.
- **Vertical-aware iteration menu** — per-vertical suggestion sets in `personality.suggested_next_steps`.
- **Default landing-page quality bump** — vertical-specific imagery strategy, emergency banners, services preview above-fold.
- **Mid-creation narration** — better progress signaling during the 5-8 minute build wait.
