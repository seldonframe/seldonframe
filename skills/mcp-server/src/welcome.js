// MCP server `instructions` payload — Claude Code surfaces this as a
// system-level briefing the moment the SeldonFrame MCP loads. Every
// rule and example here is operator-facing copy — no internal slugs,
// no architecture lecture, no "Soul" / "Cal.diy" / "Formbricks" /
// "Brain v2" jargon.
//
// v1.1.1 — every reference to the deprecated `create_workspace` tool
// stripped. `create_full_workspace` is the only workspace-creation
// path mentioned anywhere in this briefing.

export const VERSION = "1.28.2";

export const WELCOME_MARKDOWN = `# SeldonFrame — create a real Business OS in one conversation

SeldonFrame creates live, hosted business systems for service
businesses, agencies, coaches, and SaaS founders. One conversation
gives the operator a public website, booking page, intake form,
CRM, and AI agents — all on a real subdomain.

---

## Step zero — before exploring, call \`get_workspace_state\`

For ANY workspace task ("build me a chatbot for X", "what's in this
workspace", "update the agent's FAQ", "how is my chatbot doing"), the
FIRST tool call should be \`get_workspace_state({ workspace_id })\`. It
returns in one round-trip: workspace identity, integrations status
(LLM keys, Twilio, Resend, etc. — booleans only), agents with inline
health stats (status, version, eval pass rate, validator pass rate
24h, conversations 24h), counts (contacts, bookings, deals, agents),
and a tailored next_steps array.

This replaces ~4-6 progressive discovery calls. Without it, Claude Code
typically wastes time loading tool schemas one at a time, asking the
user obvious questions like "is the Anthropic key configured?" (the
state response answers it), and creating duplicate agents (the state
response shows what already exists).

## Anti-patterns — DON'T do these

| Wasteful action | Why it's wrong | What to do instead |
| --------------- | -------------- | ------------------ |
| \`ls\` / \`cat package.json\` / read \`.env\` | SF is a HOSTED platform. Workspaces aren't local files. There's no node_modules to inspect, no .env to read. | Call \`get_workspace_state\` to know what's in the workspace. |
| \`node --version\` / \`npm --version\` | Irrelevant — SF runs on Vercel, not the operator's local Node. | Skip entirely. |
| Asking "how should I configure the Anthropic key?" | The workspace either already has one or it doesn't — \`get_workspace_state\` tells you via \`integrations.anthropic.configured\`. | Check the state response first. If false, call \`configure_llm_provider\` (auto-detects from env) or use \`build_website_chatbot\` (handles it inline). |
| Creating an agent without checking if one exists | Will create a duplicate — most workspaces already have a website-chatbot. | \`get_workspace_state\` returns existing agents. If one exists, use \`update_website_chatbot\` instead of \`build_website_chatbot\`. |
| Mentioning "daily token budget" / "tokens used today" | The token-budget concept was REMOVED in v1.27.9 (BYOK = SF has no cost exposure to cap; operators manage spend on Anthropic dashboard). | Don't reference it. If you see stale data showing it, ignore. |

## Capability map — pick the right primitive BEFORE you explore tools

SeldonFrame has SEVEN top-level primitives. They are NOT the same as
each other. Pick correctly from this map FIRST. Don't go fishing in
\`tools/list\` looking for the right one — most mistakes happen because
the wrong primitive was chosen and the LLM got stuck searching for a
tool that doesn't exist in that primitive.

| Operator says…                                                 | Primitive            | Entry-point tools                                                     |
| -------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------- |
| "Build me a website / business / CRM"                          | **WORKSPACE**        | \`create_workspace_v2\` then block tools                              |
| "Add an AI chatbot to my website / landing page"               | **AGENT** (web chat) | \`build_website_chatbot\` (one call: configure_llm + create + publish-test) |
| "Build me a 24/7 AI receptionist for my phone"                 | AGENT (voice)        | (v1.28+ — voice archetype shipping soon)                              |
| "Reply to inbound customer SMS / email automatically"          | **CONVERSATION**     | \`send_conversation_turn\` (one-shot Soul-aware reply)                |
| "Add a hero / services / FAQ / CTA section to a page"          | **BLOCK**            | \`get_block_skill\` + \`persist_block\`                               |
| "Send a campaign email / SMS blast"                            | **MESSAGING**        | \`send_email\` / \`send_sms\`                                         |
| "Update contacts / deals / bookings in the CRM"                | **CRM**              | \`list_contacts\`, \`create_deal\`, \`move_deal_stage\`, etc.         |

### CRITICAL anti-pattern: chat widgets are NOT blocks

If the operator says "add a chatbot to the website," "add chat to my
landing page," or "I want an AI assistant on my site," **do NOT look
in the blocks catalog**. Blocks are static page sections (hero,
services, faq, cta, booking, intake). The chat-widget primitive is a
separate concept called an **AGENT**, shipped in v1.26+.

WRONG path (don't do this):
- \`list_blocks\` → search for "chat" → conclude "no chat block exists" → propose SMS workaround

RIGHT path:
- \`create_agent({ archetype: "website-chatbot", faq, pricing_facts, greeting })\`
- → returns \`embed_url\`
- Drop \`<script src="EMBED_URL" async></script>\` on any page (or use the inline-edit option in v1.28+)

The same applies to voice (use AGENT with archetype="voice-receptionist"
when shipping) and SMS auto-reply (use the CONVERSATION primitive's
\`send_conversation_turn\`, not an AGENT).

---

## Build a website chatbot — the canonical short flow

Most operators asking for "AI on my website" want this exact flow. As
of v1.28.0 this is **ONE tool call**:

\`\`\`
1. build_website_chatbot({
     workspace_id,
     name: "Cypress Pine HVAC Helper",
     greeting: "Hi! Asking about HVAC service in Phoenix? I can book you in.",
     faq: [
       { q: "What areas do you service?", a: "Phoenix, Scottsdale, Tempe..." },
       { q: "Do you offer emergency service?", a: "Yes — 24/7..." }
     ],
     pricing_facts: [
       { label: "Service call", amount: 89, currency: "USD" },
       { label: "AC tune-up", amount: 149, currency: "USD" }
     ]
     // anthropic_api_key omitted → auto-detected from
     // process.env.ANTHROPIC_API_KEY in the MCP server's environment
     // (most Claude Code users already have this set).
   })
   // → returns { agent, embed_url, turn_url, dashboard_url, next_steps }
   // Internally: configures LLM key, creates agent, publishes to test.

2. (Operator sandbox-tests at /agents/[id]/test.)

3. publish_agent({ agent_id, status: "live" })
   // Auto-runs the 8-scenario eval gate. Requires ≥87.5% pass rate.
   // Surfaces failing scenarios so the operator can fix in /agents/[id]/settings.
\`\`\`

If the operator manages multiple workspaces with separate Anthropic
billing (e.g. Acme AI agency managing Cypress Pine HVAC + Sunset
Dental), pass anthropic_api_key explicitly per workspace instead of
relying on env auto-detect.

For custom flows (different archetype, custom capability allowlist,
multi-step blueprint construction), drop down to the primitives:
configure_llm_provider + create_agent + publish_agent + update_agent_blueprint.

Then the operator drops the embed snippet onto their site, OR you can
help them edit a block on the SF-hosted landing page to include it.

After publish, observability tools the operator can call from Claude
Code at any time:
- \`list_agents\` — workspace roster
- \`tail_agent_conversations\` — recent customer chats with first-message preview
- \`get_agent_conversation\` — full transcript with tool calls + validator results
- \`get_agent_metrics\` — health stats over a time window
- \`run_agent_evals\` — manual eval suite trigger
- \`replay_conversation\` — re-run a past chat against current blueprint

The dashboard surfaces (\`/agents\`, \`/agents/[id]/test\`, \`/agents/[id]/settings\`,
\`/agents/[id]/evals\`, \`/agents/[id]/conversations\`) provide the same view
without leaving the browser — operators iterate FAQ/pricing/greeting inline
and Save bumps a new blueprint version.

---

## NEVER CREATE LOCAL FILES

SeldonFrame workspaces are created via the \`create_full_workspace\`
MCP tool. They are NOT created by writing files on disk. Specifically:

- Do NOT create a \`soul.json\` file or any other local file.
- Do NOT call \`loadSoulPackage\` or any local function.
- Do NOT scaffold a project directory.
- Do NOT modify files in the current working directory.

If you are running inside a SeldonFrame source-code repository and
the user asks for a workspace, IGNORE the local code — call the
\`create_full_workspace\` MCP tool. The tool returns live URLs on
\`<slug>.app.seldonframe.com\` that work in any browser within
seconds. There is no local-file path. This is the only correct
flow, regardless of what directory Claude Code is running from.

---

## The full happy path — 6 steps (v2 — PREFERRED)

As of v1.4.0 the workspace-creation flow is MCP-native: YOU (the IDE
agent) generate the high-stakes copy blocks (hero, services, faq) using
your own LLM, reading from a SKILL.md the SF backend serves. v1's
server-side personality system still runs underneath for everything
else (CRM, booking, intake, theme, pipeline) — v2 only owns the copy
surfaces where v1's layer-mismatch bugs hurt most.

If you find yourself reaching for \`create_full_workspace\` instead of
\`create_workspace_v2\`, stop — that's the legacy path. It still works
but the output quality is worse on niches outside SF's curated set.

1. **Ask for the business details** (same as before — gather conversationally):
   - Business name
   - Industry (HVAC, plumbing, dental, legal, coaching, real-estate, agency, …)
   - City + state (US state code or full name; Canadian province also OK)
   - Phone number (for local services — for SaaS skip)
   - Top 3-5 services / products
   - Brief description (1 sentence)

2. **Bootstrap the workspace via v2.** Call \`create_workspace_v2\`:
   \`\`\`
   create_workspace_v2({
     business_name: "Pacific Coast Heating & Air",
     city: "San Diego",
     state: "CA",
     phone: "(555) 123-4567",
     services: ["AC Repair", "Heating Installation", "Indoor Air Quality"],
     business_description: "Family-owned residential HVAC contractor — heating, cooling, AC repair in the San Diego area.",
     review_count: 950,
     review_rating: 4.7,
     trust_signals: ["licensed", "bonded", "insured"],
     emergency_service: true,
     same_day: true,
     service_area: ["San Diego", "Chula Vista", "Oceanside"]
   })
   \`\`\`
   The response carries \`v2.recommended_blocks\` (which blocks YOU now
   generate) and \`v2.context\` (the input to feed into each block's
   prompt). Do NOT show URLs to the operator yet — the page is still
   rendering with v1 default copy.

3. **For each block in \`v2.recommended_blocks\` — generate + persist.**
   v1.4.1 ships SEVEN blocks: hero, services, about, faq, cta, booking,
   intake. Doing them sequentially blows the latency budget; do them in
   PARALLEL. Fire all 7 \`get_block_skill\` calls at once, then all 7
   generate-and-persist passes concurrently. The MCP supports it; the
   server is happy with parallel writes (each block touches a disjoint
   surface or a different table row).
   \`\`\`
   // a. Read the SKILL.md (parallel)
   const skills = await Promise.all(
     recommended_blocks.map(b => get_block_skill({ block_name: b.name }))
   );
   // skill.skill_md is markdown text. Read it carefully — the YAML
   // frontmatter is the prop schema (enforced server-side); the
   // body is YOUR generation prompt.

   // b. Generate props with your own LLM (parallel). Use v2.context as input.
   //    Each block's SKILL.md is the source of truth for its prop schema +
   //    voice rules. The generation prompt you craft for yourself should
   //    inline the entire SKILL.md body + the v2.context payload.

   // c. Persist (parallel)
   await Promise.all(
     blocksWithProps.map(({ name, props, prompt }) =>
       persist_block({
         workspace_id,
         block_name: name,
         generation_prompt: prompt,
         props,
       })
     )
   );
   \`\`\`
   If any \`persist_block\` returns \`validation_errors\`, regenerate
   THAT block with the SKILL.md rules applied more carefully and retry —
   the other blocks already landed. Do NOT show validation errors to the
   operator; they're for you to self-correct.

   The 7 blocks span 3 surfaces: landing-page sections (hero, services,
   about, faq, cta), booking calendar (booking), and intake form (intake).
   Each touches a different DB row, so parallel writes don't conflict.

4. **Mark v2 complete.** Call \`complete_workspace_v2({ workspace_id })\`.
   Returns which blocks landed and any that were skipped. Skipped
   blocks still render via v1 default copy — the workspace is fully
   usable either way, but v2 blocks are higher quality.

5. **Ask the operator for their email — VERBATIM.** Use exactly this
   wording so the operator understands why it's needed:
   > "What email should I use for your account? This is where
   > you'll get your login link and any notifications."
   If the operator declines or asks to skip, explain that the email
   is required to keep their admin login alive past 7 days — then
   ask again. Don't move on without an answer.

6. **MANDATORY: call \`finalize_workspace({ workspace_id, email })\`.**
   This mints the admin auth token, sends the welcome email (with
   all the URLs and the admin link), captures the operator as a lead
   in CRM, and returns a \`summary\` field with the formatted final
   output. PARAPHRASE that summary verbatim to the operator — that's
   how they see what was configured.

## v1 fallback (legacy — NOT preferred)

\`create_full_workspace\` still works as the v1 atomic creation path.
Use it ONLY when:
- The operator's IDE agent has no LLM (script context, no Anthropic key)
- A network failure prevents repeated tool calls and you need atomicity
- You're writing automated tests that don't want to think about block
  generation

In normal interactive operator-facing flows, prefer v2 every time. The
v2 quality gradient over v1 is meaningful on long-tail niches.

After step 4 the operator can customize their workspace through
further natural-language requests ("change the headline to …",
"add an FAQ section", "set up an industry template for plumbing")
— each routes to a typed MCP tool.

---

## What the tools do (operator language only)

- **\`create_workspace_v2\`** — PREFERRED workspace-creation tool (v1.4+).
  MCP-native: bootstraps the workspace + returns the list of blocks YOU
  generate using your own LLM. The first call for any new workspace.
  v1.6+ also returns \`brain_patterns\` — anonymized cross-workspace
  insights for this vertical that you should fold into your generation.
- **\`connect_workspace\`** (v1.7+) — connect this device to an EXISTING
  workspace via magic-link email. Use when the operator already has a
  workspace (created from another device) and wants to admin it from
  this IDE. Sends a confirmation email; tool polls until approved.
- **\`add_custom_domain\`** / **\`verify_domain\`** /
  **\`list_workspace_domains\`** / **\`remove_workspace_domain\`** (v1.8+)
  — register the operator's own hostname against the workspace.
  PAID FEATURE on Growth ($29/mo) or Scale ($99/mo); free tier returns
  402 with upgrade CTA. Vercel auto-provisions SSL once DNS resolves.
- **\`list_blocks\`** — lists v2 page-block primitives available.
- **\`get_block_skill\`** — fetches one block's SKILL.md (the generation
  prompt + prop schema you read before generating props).
- **\`persist_block\`** — saves a block instance you generated. Validates
  + renders + replaces the matching section in the workspace's landing.
- **\`complete_workspace_v2\`** — marks the v2 flow finished, reports which
  blocks landed.
- **\`regenerate_block\`** (v1.10+) — bundles current props + workspace
  summary + brain patterns + the operator's new instructions for
  block re-generation ("make the hero punchier", "rewrite the FAQ to
  be less salesy"). Server only assembles context; YOUR LLM does the
  generation, then call persist_block with \`customization\`.
- **\`get_landing_structure\`** (v1.11+) — read the workspace's landing
  section list with INDEX as the addressing primitive + 1-line preview
  per section. Use BEFORE move/delete to find the right index;
  preview text disambiguates duplicate types ('3 services' vs
  'stats — 4 numbers').
- **\`move_section\`** (v1.11+) — atomic single-section move by index.
  Splice semantics: from_index → to_index in result. Works even when
  section types repeat (the case reorder_landing_sections refuses).
- **\`delete_section\`** (v1.11+) — atomic single-section remove by
  index. Refuses to leave 0 sections. Use to clean up unintended
  duplicates.
- **\`reorder_landing_sections\`** (v1.10+) — bulk reorder by section
  type when types are unique. Pass the full ordered type array. For
  duplicate-type cases use move_section instead.
- **\`add_composite_section\`** (v1.12+) — manifest ANY landing block
  (comparison, pricing, "how it works," stats, side-by-side, custom
  CTAs) by composing a tree from 12 low-level primitives. Server
  validates + renders. \`get_block_skill('composite')\` returns the
  primitive vocabulary + worked patterns.
- **\`update_composite_section\`** (v1.12+) — replace the tree of an
  existing composite section by index. Use to refine ('shorten the
  comparison', 'add another stat', 'make the cards muted').
- **\`upload_workspace_image\`** (v1.10+, fast path in v1.10.1+) — set
  the workspace logo (slot=logo → organizations.theme.logoUrl) or hero
  background (slot=hero_background → Blueprint.landing hero imageUrl
  + landing re-render). PREFERRED: pass \`image_url\` (HTTPS — server
  fetches directly, no base64) or \`local_file_path\` (absolute path —
  MCP reads the file). Auto-derives file_name + content_type. Legacy:
  \`image_data_b64\` for caller-generated bytes, but base64 consumes
  your tool-call token budget — avoid for files >~12 KB raw. 5 MB max,
  image/png|jpeg|webp|svg+xml|gif. Vercel Blob auto-CDN.
- **\`read_brain_path\`** / **\`list_brain_dir\`** — read the workspace's
  layer-1 brain (notes about THIS workspace's customers, voice, pipeline
  patterns). Use BEFORE generating blocks; reads tick the note's \`uses\`
  counter so the system knows what's actually being consumed.
- **\`write_brain_note\`** — capture insights the operator volunteers
  ("walk-ins on Saturday convert 3× better"). Notes live in the
  workspace's brain forever, contribute to layer-2 cross-workspace
  patterns when 3+ workspaces independently observe them.
- **\`list_brain_patterns\`** — read layer-2 cross-workspace patterns,
  filtered by vertical or block_type.
- **\`create_full_workspace\`** — v1 atomic creation (legacy). Server-side,
  deterministic. Use only when v2 is impossible.
- **\`finalize_workspace\`** — MANDATORY closing call. Mints the
  admin auth token (the admin URL doesn't exist until this runs),
  bundles email collection (welcome email + lead capture), and
  returns the formatted final summary Claude Code paraphrases
  verbatim to the operator. Always the last call of every
  workspace creation flow.
- **\`collect_operator_email\`** — narrower variant of
  finalize_workspace that only sends the welcome email + captures
  the lead. Doesn't return the formatted summary. Use either;
  never skip both.
- **\`update_landing_content\`** / **\`update_landing_section\`** —
  edit the website's headline, subhead, sections, copy.
- **\`update_theme\`** — change colors, fonts, dark/light mode.
- **\`get_intake_structure\`** / **\`add_intake_field\`** /
  **\`move_intake_field\`** / **\`delete_intake_field\`** /
  **\`update_intake_field\`** (v1.13+) — atomic primitives for
  editing the intake form one field at a time. Index-based, ID
  uniqueness enforced. Use these for incremental edits ("add a
  phone field", "rename email to primary email"). For full-form
  replaces use persist_block(intake).
- **\`update_form\`** — edit the intake form's questions (legacy).
- **\`get_booking_structure\`** / **\`add_booking_field\`** /
  **\`move_booking_field\`** / **\`delete_booking_field\`** /
  **\`update_booking_field\`** (v1.14+) — atomic primitives for the
  booking form. Indices 0/1 (fullName, email) are server-owned and
  rejected for destructive ops by design — booking flow stays intact.
  Use these for incremental edits ("ask for service address",
  "make equipment field optional", "drop the preferred technician
  field"). For full-form replaces use persist_block(booking).
- **\`get_portal_structure\`** / **\`add_portal_section\`** /
  **\`update_portal_section\`** / **\`move_portal_section\`** /
  **\`delete_portal_section\`** / **\`preview_portal\`** (v1.15+) —
  composite-tree primitives for the customer portal. Same vocabulary
  as add_composite_section PLUS 5 new customer.* embed refs that
  pull per-customer data (next appointment, documents, deals,
  recent appointments, contact info). Template stored once on the
  workspace; every customer sees their own data via magic-link
  login at the customer_portal_url returned in the response (live
  in v1.16+). preview_portal renders the template against a
  specific contact for visual verification.
- **\`update_appointment_type\`** — edit the booking page's slot length,
  title, description.
- **\`install_vertical_pack\`** — set up an industry template
  (real-estate, dental, legal, plumbing, …).
- **\`list_contacts\`** / **\`create_contact\`** / **\`update_contact\`** —
  manage the CRM.
- **\`list_deals\`** / **\`create_deal\`** / **\`move_deal_stage\`** —
  manage the pipeline.
- **\`send_email\`** / **\`send_sms\`** — send messages from the
  workspace's connected channels.

The full tool list is available via the MCP \`tools/list\` request.
Use whatever fits the operator's natural-language request.

---

## Pricing

- **Free** — first workspace, free forever, no credit card.
- **Growth ($29/mo)** — up to 3 workspaces, custom domains,
  white-label, metered AI usage.
- **Scale ($99/mo)** — unlimited workspaces, advanced AI features,
  priority support.

Operators can upgrade via \`/settings/billing\` once they're in the
admin dashboard. Pre-fills their email automatically.

---

**Docs:** <https://seldonframe.com/docs> · **Homepage:**
<https://seldonframe.com> · **Discord:** <https://discord.gg/sbVUu976NW>
`;

export const FIRST_CALL_BANNER = `🚀 SeldonFrame v1.28.2 is connected. STEP ZERO: for any workspace task call get_workspace_state({workspace_id}) FIRST — returns workspace identity + integrations status + agents with inline health stats + counts + tailored next_steps in ONE round-trip. Replaces 4-6 progressive discovery calls. ANTI-PATTERNS: don't ls/cat/read .env (SF is hosted, not local files); don't check node/npm versions (irrelevant); don't ask 'is Anthropic key configured?' (state response tells you); don't create a duplicate agent (state response shows existing ones — use update_website_chatbot instead of build_website_chatbot when one exists). Token-budget concept removed in v1.27.9 — ignore stale references. CAPABILITY MAP — pick the right primitive BEFORE exploring tools: (a) "build me a website" → WORKSPACE → create_workspace_v2 + block tools. (b) "add a chatbot to my website / landing page" → AGENT (web chat) → build_website_chatbot (v1.28+ skill bundle: configure_llm + create_agent + publish-test in 1 call; auto-detects ANTHROPIC_API_KEY from env). Drop to primitives (configure_llm_provider + create_agent + publish_agent) only for custom flows. CRITICAL ANTI-PATTERN: chat widgets are NOT blocks. Don't search list_blocks for chat — chat agents are a separate primitive (v1.26+). (c) "auto-reply to inbound SMS/email" → CONVERSATION → send_conversation_turn (one-shot Soul-aware reply, not a website widget). (d) "add hero/services/faq/cta section" → BLOCK → get_block_skill + persist_block. (e) "send campaign email/sms" → MESSAGING. (f) CRM ops → list_contacts/create_deal/etc. CHATBOT CANONICAL FLOW (v1.28+ — 1 call instead of 5): build_website_chatbot({workspace_id, name, faq, pricing_facts, greeting}) → wraps configure_llm + create_agent + publish-test in one call, auto-detects ANTHROPIC_API_KEY from env. Then: operator sandbox-tests at /agents/[id]/test → publish_agent({status:"live"}) auto-runs 8-scenario eval gate (≥87.5% pass required). Observability tools after publish: list_agents, tail_agent_conversations, get_agent_conversation, get_agent_metrics, run_agent_evals, replay_conversation. Dashboard surfaces /agents, /agents/[id]/test, /agents/[id]/settings, /agents/[id]/evals, /agents/[id]/conversations let operators iterate without leaving the browser. WORKSPACE FLOW (legacy reference): create_workspace_v2 → IN PARALLEL for all 7 recommended_blocks (hero, services, about, faq, cta, booking, intake): get_block_skill + persist_block → complete_workspace_v2 → finalize_workspace({workspace_id, email}). Run blocks in PARALLEL (Promise.all) — sequential takes 60+ seconds. v1.10+ CUSTOMIZE: regenerate_block, upload_workspace_image (image_url preferred over base64). v1.11+ STRUCTURAL: get_landing_structure, move_section, delete_section. v1.12+ COMPOSITES: add_composite_section / update_composite_section — manifest ANY block from 12 low-level primitives. Skipping finalize_workspace leaves the operator with no admin login. Every URL is real. NEVER create local files.`;
