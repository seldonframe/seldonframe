# Ops-stack-only workspace creation (skip landing page by default)

**Status:** Approved design — ready for implementation planning.
**Author:** Maxime + Claude (brainstorm session 2026-05-15)
**Predecessors:** `2026-05-15-wire-archetype-design-system-design.md` (just shipped), `2026-05-15-agency-output-product-moment-design.md`, `2026-05-14-pull-firecrawl-out-of-backend-design.md`

---

## 1. Problem

The pitch SeldonFrame sells is "**CRM. Booking. Intake. AI chatbot. Already wired. Deploy per client in 3 minutes. The open-source alternative to GoHighLevel.**" The agency operator's clients ALREADY HAVE WEBSITES — they don't need SF to replace their site, they need SF to bolt on the ops layer (chatbot + CRM + booking + intake) their existing site is missing.

But the current `create_workspace_from_url` flow spends ~2.5 of its 3 minutes generating a landing page no one asked for. And the generated page is the largest UX failure surface — when it looks shitty (see the Ignitify camel-in-Sahara hero from the v1.54 smoke test), the whole pitch collapses.

### 1.1 Concrete evidence the landing page is the wrong default

- **Quigley HVAC workspace:** landing page came out premium (editorial-warm template) → pitch held up.
- **Ignitify HVAC workspace:** archetype detected correctly (bold-urgency), variant overridden server-side per v1.54, BUT the rendered page shows desert camels for an HVAC business + sparkle placeholder icons (lucide-react hotfix regression) + no Hormozi structure → operator reaction: "very shitty looking website. wtf? why?"
- **Quigley vs. Ignitify variability** is the problem: when the landing page is generated automatically, output quality is non-deterministic, and the pitch fails when quality dips.

### 1.2 Root cause framing (first-principles)

The 3 minutes of landing-page generation pays for the wrong thing. The agency operator's client:
- Already has a website (their existing marketing surface)
- Does NOT have a CRM, booking page, intake form, or AI receptionist
- Will paste an embed snippet onto their existing site to add the chatbot

So the high-value 30 seconds are: provision the ops stack + give the operator a snippet to paste. The low-value 2.5 minutes are: generate a landing page that competes with the client's existing site (which the operator usually doesn't want to replace).

### 1.3 What the v1.54 work fixed and didn't fix

v1.54 (just shipped) ensures that WHEN a landing page is generated, the archetype propagates and the visual identity is correct (template + variant + Unsplash fallback). It's necessary infrastructure but doesn't solve the "landing page is a non-deterministic UX surface that operators don't always need" problem. v1.55 makes landing page generation OPT-IN — and v1.54's enforcement still runs on the opt-in path.

---

## 2. Goals

1. **Workspace creation drops from ~3 min to ~30 sec** (no LLM block generation by default)
2. **Chatbot embed snippet is the first-class output** — operator's "magic moment" is pasting it on the client's site
3. **The SF preview URL** at `<slug>.app.seldonframe.com` shows a chatbot-only demo page (lets the operator share a working chatbot URL with their client before they paste the snippet)
4. **Auto-created chatbot is responsive by default** (TEST status, not DRAFT)
5. **7 ready-to-deploy automations** are surfaced in the operator output (Speed-to-Lead, Missed-Call-Text-Back, Review Requester, etc.) — completes the GHL-alternative pitch
6. **Landing-page generation becomes operator-prompted** via a new `landing-page-creation` SKILL.md — antifragile to model upgrades (Claude does the work, SF provides the persist primitives)

## 3. Non-goals

- Building a bold-urgency hero template (deferred — only needed when operators opt into landing pages for trades, after we have usage data)
- Fixing lucide-react properly (deferred — only matters when landing pages render)
- Hormozi block scaffolding refresh (deferred)
- Per-archetype curated Unsplash query tuning (deferred — v1.54 work)
- Migrating existing workspaces (they keep their landing pages — backward compat)
- Soul-suggested automation auto-activation (the "0 active • 8 available" dashboard UI exists — activation logic is separate)
- A new MCP tool for landing-page generation (per the user's choice — pure SKILL.md path)
- Auto-promoting chatbot from TEST → LIVE when embed detected on a real site (future telemetry feature)
- A/B testing different chatbot demo layouts
- Custom domain auto-setup for the preview URL

---

## 4. Architecture

### 4.1 Four coordinated changes

**Change 1 — Strip landing-page generation from `createFullWorkspace`.** The enhance-blocks step (the LLM-driven block generation that costs ~2.5 of the 3 minutes) is removed from the pipeline. The seed-landing-from-soul canned fallback is also removed (irrelevant when no landing page is generated). Both are replaced with a single ~30-line `seedChatbotPreviewLanding` function.

**Change 2 — NEW chatbot-preview page replaces empty landing at the public URL.** A new `ChatbotPreview` React component renders a branded, theme-tinted, full-page chat interface (NOT the floating-widget pattern from embed.js, because the whole preview page is the demo). It reuses the existing `landing_pages.sections` JSONB pipeline by adding a new `"chatbot-preview"` section type. Operator can later replace it with hero/services/etc via the SKILL.md (block persistence evicts the chatbot-preview section naturally).

**Change 3 — Landing-page generation becomes operator-prompted via NEW `skills/landing-page-creation/SKILL.md`.** Operator says "build a landing page for X in bold-urgency style", Claude Code reads the SKILL.md, walks through `get_workspace_state → get_block_skill per block → persist_block per block`. v1.54's server-side archetype enforcement still fires at persist time. All existing block SKILL.md files (hero, services, FAQ, etc.) get composed.

**Change 4 — Auto-created chatbot defaults to TEST status (was DRAFT).** Explicit `status: "test"` passed at the `complete_workspace_v2` auto-chatbot creation site. Chatbot responds immediately on the preview page. Operator promotes to LIVE via existing `publish_agent` tool when ready.

### 4.2 The new pipeline (13 steps, down from 14)

```
 1. Validate input
 2. Generate slug
 3. Create org row
 4. Generate org soul (LLM)
 5. Resolve personality vertical (LLM if unclear)
 6. Configure timezone
 7. Apply theme (archetype-driven palette/fonts — v1.40)
 8. Seed pipeline + stages
 9. Configure booking template
10. Configure intake form
11. Create chatbot agent (status: "test" by default)
12. seedChatbotPreviewLanding (replaces old steps 12+13)
13. Validate workspace artifacts
```

Net effect: ~2.5 min removed. The enhance-blocks function stays in the codebase (used by the landing-page-creation SKILL.md path via persist_block — just no longer called from `createFullWorkspace`).

### 4.3 What the operator sees

```
✅ Client ops stack ready for Ignitify Cooling. (32 seconds)

📞 AI receptionist — paste before </body> on ignitifyep.com to go live:
<script src="https://app.seldonframe.com/api/v1/public/agent/ignitify-cooling/embed.js" async></script>

🤖 Demo for your client: https://ignitify-cooling.app.seldonframe.com
   (Chatbot live in TEST mode — share so your client can try it before pasting)

📅 Booking: /book    📝 Intake: /intake    🔧 Admin: …

⚡ 7 more automations ready to deploy for this client:
   • Speed-to-Lead — text the lead within 30 sec of intake submission
   • Missed-Call Text Back — auto-SMS when their phone goes unanswered
   • Review Requester — ask for a 5★ after every completed booking
   • Appointment Confirm via SMS — reduce no-shows automatically
   • Weather-Aware Booking — reschedule outdoor jobs when rain is forecast
   • Daily Digest — morning summary of yesterday's activity
   • Win-Back — re-engage cancelled subscribers with a time-limited code
   Activate any: https://app.seldonframe.com/automations
   (Need API keys for SMS/email? Just ask — Claude will walk you through
    Twilio / Resend / Stripe setup when an automation needs one.)

💼 Tier: Free  ·  Upgrade $9/mo for unlimited workspaces  ·  Client portal: …

Want a landing page too? Just ask: "build a landing page for Ignitify Cooling
in bold-urgency style" — Claude will use the landing-page-creation skill to
generate one with the archetype voice.
```

That's the **full GHL-replacement pitch in 14 lines of operator-visible text**.

---

## 5. Detailed changes

### 5.1 New chatbot-preview section type

`packages/crm/src/lib/landing-pages/types.ts` — extend the union:

```typescript
export type LandingPageSection =
  | HeroSection
  | ServicesGridSection
  | ProjectGallerySection
  | TestimonialsSection
  | FaqSection
  | EmergencyStripSection
  | NavbarSection
  | CtaSection
  // v1.55.0 — new section type for the chatbot-only preview page
  | ChatbotPreviewSection;

export interface ChatbotPreviewSection {
  type: "chatbot-preview";
  order: number;
  content: {
    businessName: string;
    tagline: string;
    embedUrl: string;
    themeMode: "light" | "dark";
  };
}
```

### 5.2 New ChatbotPreview React component

`packages/crm/src/components/landing/sections/chatbot-preview.tsx` — full-page centered layout:

```typescript
// Layout (mobile-first):
// ┌──────────────────────────────────────────────────────────────┐
// │                  {businessName}                              │ ← h1
// │  AI receptionist — ask anything about our service            │ ← tagline
// │                                                              │
// │  ┌────────────────────────────────────────────────────────┐  │
// │  │ [Full-width chat interface — not floating widget]      │  │
// │  │ Bot: Hi! I'm {businessName}'s assistant. Ask me ...   │  │
// │  │ [User input box]                                       │  │
// │  └────────────────────────────────────────────────────────┘  │
// │                                                              │
// │  Want this on your site? Paste before </body>:               │
// │  <script src="…/embed.js" async></script>  [Copy]            │
// │  Or skip the paste — share this URL with your customers.     │
// └──────────────────────────────────────────────────────────────┘
```

Theme application:
- `primaryColor` → user message bubble + send button + Copy button
- `accentColor` → bot message bubble accent
- `fontFamily` → entire page
- `mode: "light" | "dark"` → background
- Logo if `logoUrl` set (top-left), else just the business name

The chatbot here is the FULL PAGE (not the floating-widget from embed.js). Two reasons: (1) on the client's real site, the chatbot is incidental — widget makes sense; (2) on the demo page, the chatbot IS the whole content.

### 5.3 Page renderer dispatch

`packages/crm/src/components/landing/page-renderer.tsx` (or equivalent) — add a case in the section-type switch:

```typescript
switch (section.type) {
  case "hero":              return <HeroSection {...section.content} />;
  case "services":          return <ServicesGrid {...section.content} />;
  // ... other existing cases ...
  case "chatbot-preview":   return <ChatbotPreview {...section.content} />;  // NEW
}
```

### 5.4 seedChatbotPreviewLanding function

`packages/crm/src/lib/workspace/seed-chatbot-preview-landing.ts` — NEW:

```typescript
import { db } from "@/db";
import { landingPages } from "@/db/schema/landing-pages";
import type { LandingPageSection } from "@/lib/landing-pages/types";

export async function seedChatbotPreviewLanding(input: {
  orgId: string;
  businessName: string;
  tagline: string | null;
  orgSlug: string;
  agentSlug: string;
  themeMode?: "light" | "dark";
}): Promise<void> {
  const embedUrl = `https://${process.env.WORKSPACE_BASE_DOMAIN}/api/v1/public/agent/${input.orgSlug}--${input.agentSlug}/embed.js`;

  await db.insert(landingPages).values({
    orgId: input.orgId,
    slug: "home",
    title: input.businessName,
    sections: [
      {
        type: "chatbot-preview",
        order: 1,
        content: {
          businessName: input.businessName,
          tagline: input.tagline ?? `AI receptionist — ask ${input.businessName} anything`,
          embedUrl,
          themeMode: input.themeMode ?? "light",
        },
      },
    ] satisfies LandingPageSection[],
    contentHtml: null,
    contentCss: null,
  });

  console.warn(JSON.stringify({
    event: "chatbot_preview_seeded",
    workspace_id: input.orgId,
    agent_slug: input.agentSlug,
  }));
}
```

`tagline` is sourced from `org.soul.business_description` (truncated to ~80 chars), populated by the scrape step earlier in `createFullWorkspace` — no new LLM call.

### 5.5 createFullWorkspace pipeline strip

`packages/crm/src/lib/workspace/create-full.ts` — remove the enhance-blocks + seed-landing-from-soul steps, add the new seeding step:

```typescript
// Before (in the pipeline body, after createAgent):
//   await seedLandingFromSoul(orgId, soul);
//   await enhanceBlocks({ orgId, input, archetype, ... });

// After:
await seedChatbotPreviewLanding({
  orgId,
  businessName: input.business_name,
  tagline: soul?.business_description?.slice(0, 80) ?? null,
  orgSlug: result.slug,
  agentSlug: chatbotAgent.slug,
  themeMode: "light",
});

console.warn(JSON.stringify({
  event: "landing_page_skipped_default",
  workspace_id: orgId,
}));
```

### 5.6 Default chatbot status change

`packages/crm/src/app/api/v1/workspace/v2/complete/route.ts` — explicit pass at the auto-chatbot creation callsite:

```typescript
// Before:
const agent = await createAgent({
  orgId,
  archetype: "website-chatbot",
  // status defaults to "draft"
});

// After:
const agent = await createAgent({
  orgId,
  archetype: "website-chatbot",
  status: "test",  // v1.55.0 — responsive on the preview page immediately
});

console.warn(JSON.stringify({
  event: "chatbot_auto_created_as_test",
  workspace_id: orgId,
  agent_id: agent.id,
}));
```

Explicit pass at callsite (not changing createAgent's default) to keep blast radius minimal. Other callsites that legitimately want DRAFT stay unaffected.

### 5.7 v2/complete response reshape

`packages/crm/src/app/api/v1/workspace/v2/complete/route.ts`:

```typescript
return NextResponse.json({
  workspace_id,
  slug,
  public_urls: { home, book, intake },

  // v1.55.0 — chatbot promoted to first-class object
  chatbot: {
    agent_id: agent.id,
    embed_url: embedUrl,
    embed_snippet: `<script src="${embedUrl}" async></script>`,
    preview_url: public_urls.home,
    status: "test",
  },

  // v1.55.0 — ops surfaces grouped
  ops_stack: {
    admin_url: `https://app.seldonframe.com/admin/${workspace_id}`,
    booking_url: public_urls.book,
    intake_url: public_urls.intake,
    automations_url: "https://app.seldonframe.com/automations",
  },

  // v1.55.0 — 7 ready-to-deploy automations
  available_automations: [
    { id: "speed-to-lead",            name: "Speed-to-Lead",               configured: false },
    { id: "missed-call-text-back",    name: "Missed-Call Text Back",       configured: false },
    { id: "review-requester",         name: "Review Requester",            configured: false },
    { id: "appointment-confirm-sms",  name: "Appointment Confirm via SMS", configured: false },
    { id: "weather-aware-booking",    name: "Weather-Aware Booking",       configured: false },
    { id: "daily-digest",             name: "Daily Digest",                configured: false },
    { id: "win-back",                 name: "Win-Back",                    configured: false },
  ],

  summary,                  // rewritten per 5.8
  next_steps_available,     // rewritten per 5.9
});
```

`available_automations` is statically derived from `packages/crm/src/lib/agents/archetypes/` (excluding `website-chatbot` since we already auto-created that). The `configured: false` is a v1.55 placeholder — future Brain v2 work can flip these per workspace.

### 5.8 finalize_workspace summary template (rewritten)

`skills/mcp-server/src/tools.js` — the verbatim text the operator sees in Claude Code. `{{var}}` is filled from the v2/complete response:

```
✅ Client ops stack ready for {{business_name}}. ({{duration_sec}} seconds)

📞 AI receptionist — paste before </body> on {{client_domain}} to go live:
{{chatbot.embed_snippet}}

🤖 Demo for your client: {{chatbot.preview_url}}
   (Chatbot live in TEST mode — share so your client can try it before pasting)

📅 Booking: {{ops_stack.booking_url}}
📝 Intake:  {{ops_stack.intake_url}}
🔧 Admin:   {{ops_stack.admin_url}}

⚡ 7 more automations ready to deploy for this client:
   • Speed-to-Lead — text the lead within 30 sec of intake submission
   • Missed-Call Text Back — auto-SMS when their phone goes unanswered
   • Review Requester — ask for a 5★ after every completed booking
   • Appointment Confirm via SMS — reduce no-shows automatically
   • Weather-Aware Booking — reschedule outdoor jobs when rain is forecast
   • Daily Digest — morning summary of yesterday's activity
   • Win-Back — re-engage cancelled subscribers with a time-limited code
   Activate any: {{ops_stack.automations_url}}
   (Need API keys for SMS/email? Just ask — Claude will walk you through
    Twilio / Resend / Stripe setup when an automation needs one.)

💼 Tier: {{tier}}  ·  {{tier_upsell}}  ·  Client portal: {{client_portal_url}}

Want a landing page too? Just ask: "build a landing page for {{business_name}}
in {{aesthetic_archetype}} style" — Claude will use the landing-page-creation
skill to generate one with the archetype voice.
```

What's gone vs. the v1.53 template:
- "Landing page rendered with X sections" — no landing page rendered anymore
- "Powered by your Claude Code key" note — irrelevant without block generation
- "Publish live: publish_agent(...)" CTA — chatbot is already TEST; operator can publish via dashboard or existing publish_agent

What's new:
- Chatbot embed snippet promoted to slot #1
- "Demo for your client" framing on the preview URL
- 7-automation callout with the dashboard URL + API key handling note
- "Want a landing page" closing nudge that names the SKILL.md trigger phrase

### 5.9 next_steps_available rewrite

```typescript
next_steps_available: [
  { id: "deploy_chatbot_embed",     label: "Paste chatbot embed on client's existing site",
    action: "user_action",         payload: { snippet: chatbot.embed_snippet, target: client_domain } },
  { id: "promote_chatbot_to_live", label: "Promote chatbot TEST → LIVE",
    action: "publish_agent",       payload: { agent_id: chatbot.agent_id } },
  { id: "activate_automation",     label: "Activate one of the 7 ready automations",
    action: "open_dashboard",      payload: { url: ops_stack.automations_url } },
  { id: "configure_integration",   label: "Configure Twilio / Resend / Stripe",
    action: "claude_assisted",     payload: { available_providers: ["twilio", "resend", "stripe"] } },
  { id: "build_landing_page",      label: "Build a landing page (uses landing-page-creation skill)",
    action: "claude_assisted",     payload: { skill: "landing-page-creation", archetype: aesthetic_archetype } },
  { id: "customize_chatbot_faq",   label: "Refine the chatbot's FAQ from source site content",
    action: "claude_assisted",     payload: { agent_id: chatbot.agent_id, source_url: scraped_url } },
]
```

6 entries (same count as v1.53). The `configure_integration` and `build_landing_page` entries are NEW.

### 5.10 MCP version bump

`skills/mcp-server/package.json`: `1.53.0 → 1.55.0` (skipping 1.54.0 since that internal version was used by the archetype work which was pure backend, no MCP changes). 1.55.0 signals the meaningful behavior change: workspace creation no longer generates a landing page, and the chatbot is promoted to the headline output.

### 5.11 NEW landing-page-creation SKILL.md

`skills/landing-page-creation/SKILL.md` — ~200 lines of markdown. Structure:

```yaml
---
name: landing-page-creation
version: 1.0.0
description: |
  Build a workspace landing page using SF blocks. Use when the operator
  asks to "build a landing page", "make a website", "design the home page",
  "redo the landing", or similar. Triggers AFTER workspace has been created
  via create_workspace_from_url (which by default creates only the chatbot-
  preview demo page — this skill replaces it with a marketing landing page).
when_to_use:
  - operator explicitly asks for a landing page
  - operator asks to redesign / refresh / regenerate the public site
  - operator asks to "show more than the chatbot demo"
when_not_to_use:
  - operator just created the workspace and hasn't asked for a landing page
  - operator wants to edit a single block (use customize_block instead)
---
```

The SKILL.md body documents:

1. **The process** (5 steps):
   - Step 1: Call `get_workspace_state` to get soul, theme, archetype, integrations
   - Step 2: Optionally consult external design skills (Anthropic's frontend-design, google-labs design.md)
   - Step 3: Decide block sequence (per-archetype guidance table)
   - Step 4: Generate and persist each block (loop over `get_block_skill` → generate props → `persist_block`)
   - Step 5: Verify via `get_workspace_snapshot`, report public URL, offer next steps

2. **Per-archetype block sequence guidance:**
   - bold-urgency: hero + emergency-strip + services + faq + cta (no testimonials if reviews < 50)
   - cinematic-aspirational: hero + project-gallery + services + testimonials + faq
   - clinical-trust: hero + credentials + services + testimonials + faq
   - editorial-warm: hero + about (long) + services + project-gallery + faq
   - (full table of all 7 archetypes)

3. **Anti-patterns:**
   - Don't skip `get_workspace_state`
   - Don't write throat-clearing copy
   - Don't propose templates outside the registry
   - Don't generate Unsplash queries longer than 4 words
   - Don't add features the workspace can't support (no SMS in copy if Twilio not configured)
   - Don't reorder blocks across persist calls

4. **3 worked examples** (one per major archetype family):
   - Trades / bold-urgency (Mr Rooter style)
   - Professional / clinical-trust (dental practice style)
   - Cinematic / cinematic-aspirational (medspa style)

5. **Integration notes:**
   - v1.54 archetype enforcement still fires server-side (don't second-guess archetype defaults)
   - Brain v2 hook: optionally call `list_brain_patterns(workspace_id)` for vertical-specific patterns
   - Validator gates: if persist_block returns warnings, FIX props and call again

---

## 6. Testing

### 6.1 Unit tests (3 new spec files)

`packages/crm/tests/unit/seed-chatbot-preview-landing.spec.ts`:
- seedChatbotPreviewLanding writes landing_pages row with expected section shape
- Tagline falls back to default when soul.business_description is null
- embedUrl format matches the existing chatbot embed pattern

`packages/crm/tests/unit/create-full-workspace-no-landing.spec.ts`:
- createFullWorkspace no longer calls enhance-blocks
- createFullWorkspace calls seedChatbotPreviewLanding instead
- Resulting workspace has landing_pages.sections = single chatbot-preview entry

`packages/crm/tests/unit/finalize-summary-v1-55.spec.ts`:
- Snapshot test of MCP summary string with 3 fixtures (HVAC, dental, medspa)
- Assert chatbot snippet, 7-automation callout, closing landing-page nudge present
- Verify embed_snippet copy is exactly what gets pasted (no escaping issues)

### 6.2 Component test (1 new file)

`packages/crm/src/components/landing/sections/chatbot-preview.spec.tsx`:
- Renders with business name, tagline, theme palette
- Embed script tag injected with correct src
- Mobile + desktop layout snapshots

### 6.3 Integration smoke test (manual on production)

1. Create workspace via `create_workspace_from_url`
2. Assert response includes `chatbot.embed_snippet`
3. Assert preview URL responds in <2s, shows ChatbotPreview component
4. Send a test message to the chatbot, assert it responds (TEST mode active)
5. Assert finalize_workspace summary includes 7-automation callout
6. Assert end-to-end creation completes in <60s
7. Test landing-page-creation SKILL.md flow: ask Claude to "build a landing page in <archetype> style", assert blocks get persisted, assert chatbot-preview section is evicted
8. Verify an EXISTING workspace (created before v1.55) still renders its old landing page (backward compat)

### 6.4 Out of test scope

- Chatbot conversation quality (existing agent infra)
- Landing-page block generation quality (v1.54)
- Plugin auto-discovery of the new SKILL.md (verify in smoke test, patch if discovery infra needs adjustment)

---

## 7. Rollout

### 7.1 Sequence

1. Land single PR → main (all 8 source files + 3 new test files + new component + new SKILL.md)
2. Vercel auto-deploys to preview + production
3. Manual smoke test on production (Section 6.3)
4. Watch logs for 24h
5. Watch for operator feedback in the next week:
   - Are operators asking for landing pages? If yes, at what frequency?
   - Are clients reporting the chatbot doesn't respond? (TEST status issue?)
   - Is the embed snippet getting pasted on real client sites? (telemetry from external embed loads)
6. After 1 week, decide on follow-up priorities

### 7.2 Observability events

| Event | Where | When | Initial expected rate |
|-------|-------|------|----------------------|
| `chatbot_preview_seeded` | seed-chatbot-preview-landing.ts | Every new workspace | 100% of creations |
| `landing_page_skipped_default` | create-full.ts | Every new workspace | 100% of creations |
| `chatbot_auto_created_as_test` | v2/complete/route.ts | Every new workspace | 100% of creations |
| `landing_page_skill_invoked` | persist_block (first hero block on chatbot-preview-only workspace) | Operator-triggered landing page | Initially low; grows over time |
| `chatbot_preview_evicted` | persist.ts (when hero replaces chatbot-preview) | Same as above | Same as above |

### 7.3 Key metrics

- **Workspace creation `duration_ms`**: should drop from current ~180s to ~30s. Track via existing `v2_workspace_create_succeeded` event.
- **Landing-page adoption rate**: ratio of `landing_page_skill_invoked` to `v2_workspace_create_succeeded` — tells us what fraction of operators actually want a landing page. Hypothesis: <50% in week 1.
- **Chatbot TEST → LIVE promotion rate**: ratio of `publish_agent` calls to `chatbot_auto_created_as_test` — tells us whether operators are actually pasting the embed on real sites.

### 7.4 Rollback

Single `git revert <merge-commit>`. New workspaces created during the v1.55 window keep their chatbot-preview landings (harmless — the React component still exists; rendering still works even after revert because we're only reverting the pipeline change, not removing the new component). New workspaces post-revert get the old landing-page generation flow back.

---

## 8. Open questions / future work

Followups, NOT blockers for this spec:

- **Plugin packaging:** verify Claude Code's plugin loader picks up `skills/landing-page-creation/SKILL.md` alongside `skills/mcp-server/`. Assume it works like other bundled skills; patch in v1.55.x if discovery fails.
- **Chained operator request:** "create a workspace for X AND build a landing page" — should Claude chain create_workspace_from_url → SKILL.md? Document this pattern in the SKILL.md's "when to use" frontmatter.
- **Soul-derived automation pre-selection:** when an HVAC workspace is created, finalize summary could highlight which of the 7 automations agencies commonly start with. Defer until usage data.
- **Brain pattern surfacing in the SKILL.md** (Step 0 hint): as multiple workspaces use the SKILL.md, Brain v2 should capture vertical-specific patterns. Patch into v1.55.x once Brain has data.
- **Existing workspace migration:** is there value in offering operators a one-click "switch this old workspace's landing to chatbot-preview"? Probably not — they generated those landings intentionally. Skip unless requested.

---

## 9. Definition of Done

- [ ] Workspace creation duration_ms drops from ~180s to ~30s in production telemetry
- [ ] v2/complete response includes chatbot (with embed_snippet, preview_url, status), ops_stack, available_automations
- [ ] Preview URL renders the ChatbotPreview component with the chatbot responsive in TEST mode
- [ ] MCP finalize_workspace summary uses the v1.55 template (chatbot first, 7 automations callout, landing-page nudge)
- [ ] Existing workspaces still render their landing pages (backward compat verified)
- [ ] 7-automation callout appears in finalize output
- [ ] Operator can ask "build a landing page" and Claude uses the new `landing-page-creation` SKILL.md
- [ ] MCP version 1.55.0 published
- [ ] All 4 new unit + component spec files pass on first run
- [ ] 24h production soak shows expected log event distribution

## 10. Scope recap

| File | Change | LoC est. |
|------|--------|----------|
| `lib/landing-pages/types.ts` | Add ChatbotPreviewSection to union | 10 |
| `components/landing/sections/chatbot-preview.tsx` | NEW — full-page chat demo component | 80 |
| `components/landing/page-renderer.tsx` | Add chatbot-preview case to section switch | 10 |
| `lib/workspace/seed-chatbot-preview-landing.ts` | NEW — seeding function | 30 |
| `lib/workspace/create-full.ts` | Pipeline strip + new seed call | 20 |
| `app/api/v1/workspace/v2/complete/route.ts` | Response reshape + explicit status: "test" | 50 |
| `skills/mcp-server/src/tools.js` | Summary template rewrite + version bump | 80 |
| `skills/mcp-server/package.json` | 1.53.0 → 1.55.0 | 1 |
| `skills/landing-page-creation/SKILL.md` | NEW — operator-prompted landing page guide | ~200 markdown |
| 4 unit/component spec files | Per Section 6 | ~200 |
| **Net new code** | | **~470 LoC + 200 markdown** |
