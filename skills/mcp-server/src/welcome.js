// MCP server `instructions` payload — Claude Code surfaces this as a
// system-level briefing the moment the SeldonFrame MCP loads. Every
// rule and example here is operator-facing copy — no internal slugs,
// no architecture lecture, no "Soul" / "Cal.diy" / "Formbricks" /
// "Brain v2" jargon.
//
// v1.1.1 — every reference to the deprecated `create_workspace` tool
// stripped. `create_full_workspace` is the only workspace-creation
// path mentioned anywhere in this briefing.

export const VERSION = "1.10.1";

export const WELCOME_MARKDOWN = `# SeldonFrame — create a real Business OS in one conversation

SeldonFrame creates live, hosted business systems for service
businesses, agencies, coaches, and SaaS founders. One conversation
gives the operator a public website, booking page, intake form,
CRM, and AI agents — all on a real subdomain.

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
- **\`reorder_landing_sections\`** (v1.10+) — reorder landing-page
  sections without changing content. Pass the full ordered array of
  section types; multiset must equal current. For content edits use
  update_landing_section; for regeneration use regenerate_block.
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
- **\`update_form\`** — edit the intake form's questions.
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

export const FIRST_CALL_BANNER = `🚀 SeldonFrame v1.10.1 is connected. PREFERRED workspace creation: create_workspace_v2 → IN PARALLEL for all 7 recommended_blocks (hero, services, about, faq, cta, booking, intake): get_block_skill + persist_block → complete_workspace_v2 → finalize_workspace({ workspace_id, email }). The v2 flow puts YOUR LLM in charge of every operator-facing surface using one SKILL.md per block. Each block's prop schema is server-validated. Run blocks in PARALLEL (Promise.all) — sequential takes 60+ seconds. v1.10+ TIER 2 CUSTOMIZE TOOLS: regenerate_block (re-do one block with operator instructions; thin-harness — server bundles context, your LLM generates), reorder_landing_sections (purely mechanical reorder by section type), upload_workspace_image (set logo/hero_background; v1.10.1+ accepts image_url or local_file_path — DON'T base64 unless you have to, the encoded string eats your tool-call token budget). Every URL is real. NEVER create local files. Skipping finalize_workspace leaves the operator with no admin login.`;
