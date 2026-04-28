export const VERSION = "1.0.2";

export const WELCOME_MARKDOWN = `# SeldonFrame — your AI-native Business OS

One command creates a real, hosted workspace with CRM, Cal.diy booking,
Formbricks intake, and Brain v2 — live on \`<slug>.app.seldonframe.com\`.
No signup, no key, no setup. Just build.

---

## Architecture: YOU are the reasoning engine

SeldonFrame's backend is pure state + artifacts. Natural-language reasoning
happens right here in this Claude Code session — YOU interpret the user's
intent and call the appropriate typed tool. The backend applies the change
deterministically. Zero backend LLM cost means the free tier is genuinely
free forever.

---

## Quick start — describe your business

To create a personalized workspace in a single turn, ask the user to paste
this template into Claude Code and fill in their details:

\`\`\`text
Create a workspace for my business:
- Business name: [your business name]
- Industry: [e.g., hvac, dental, legal, coaching, real-estate, salon, auto-repair]
- Location: [city, state/province]
- Operating hours: [e.g., Mon-Sat 7am-7pm]
- Team size: [number of people / trucks / stations]
- Services offered: [list your main services]
- Website: [URL, if you have one]
\`\`\`

When the user replies with that filled in, YOU should orchestrate the
following tool sequence (each call's response is structured — chain them):

1. \`create_workspace({ name: "<business name>", source: "<website if provided, else a 1-paragraph description>" })\`
   — mints the hosted workspace + bearer token. The \`source\` arg seeds the Soul.
2. If \`industry\` is provided, call \`install_vertical_pack({ pack: "<industry-slug>" })\`
   — adds domain-specific objects, fields, and views.
   Built-in packs: \`real-estate-agency\`. For other industries, the backend
   synthesizes a custom pack via \`/api/v1/verticals/generate\`. If a builtin
   pack matches, prefer it; otherwise call generate first, then install.
3. If \`hours\` is provided, call \`configure_booking({ title, duration_minutes, description })\`
   — sets the booking page defaults. Inline the parsed hours into \`description\`
   (the booking schema doesn't take a per-day hours object yet).
4. If \`website\` was provided, the \`source\` URL passed to step 1 already
   triggered a Soul fetch. Confirm via \`get_workspace_snapshot({})\` and
   call \`submit_soul({ soul })\` if you can extract a richer structured Soul.
5. If \`services\` were listed, customize the intake form to capture
   service-of-interest as a multi-select using \`customize_intake_form({ fields })\`.

Present the final result as a summary: live URLs (public + admin), what
was installed, and 2-3 next-best-action suggestions.

## If the user just says "create a workspace" without details

Ask these questions, one at a time, BEFORE calling \`create_workspace\`:

1. What's your business name?
2. What industry are you in? (suggest: hvac, dental, legal, coaching, real-estate, salon, auto-repair, consulting, fitness, other)
3. Where are you located? (city, state)
4. What are your operating hours?
5. What services do you offer? (3-5 main ones)
6. Do you have a website I can learn from? (optional)

Then run the orchestration above. Don't dump all six questions in one
message — ask conversationally so the user can think.

---

## How to customize a workspace later

1. Call \`get_workspace_snapshot({})\` to see current state, Soul, blocks, recent events.
2. Decide what to change based on the user's intent.
3. Call the right typed tool:
   - \`update_landing_content({ headline, subhead, cta_label })\` — rewrite /
   - \`customize_intake_form({ fields: [...] })\` — replace intake fields
   - \`configure_booking({ title?, duration_minutes?, description? })\` — edit /book
   - \`update_theme({ mode?, primary_color?, accent_color?, font_family? })\` — theme
   - \`install_caldiy_booking({})\`, \`install_formbricks_intake({})\`, \`install_vertical_pack({ pack })\`

## Compiling a Soul from a URL

Soul compilation runs HERE, not on the backend:

1. \`fetch_source_for_soul({ url })\` — backend scrapes + normalizes (up to 256KB).
2. YOU extract a structured Soul (mission, audience, tone, offerings, ...).
3. \`submit_soul({ soul })\` — persist it. Subsequent snapshots reflect it.

## Tool surface

- **Workspace:** \`create_workspace\`, \`list_workspaces\`, \`switch_workspace\`,
  \`clone_workspace\`, \`link_workspace_owner\`, \`get_workspace_snapshot\`
- **Blocks:** \`install_caldiy_booking\`, \`install_formbricks_intake\`, \`install_vertical_pack\`
- **Customize:** \`update_landing_content\`, \`customize_intake_form\`,
  \`configure_booking\`, \`update_theme\`
- **Soul:** \`fetch_source_for_soul\`, \`submit_soul\`
- **Ops:** \`list_automations\`, \`connect_custom_domain\`, \`export_agent\`,
  \`store_secret\`, \`list_secrets\`, \`rotate_secret\`

## When you'll need \`SELDONFRAME_API_KEY\`

The first workspace is free forever. Paid tiers (Starter $49/mo, Operator
$99/mo, Agency $149/mo) unlock additional workspaces, custom domains,
white-label, and advanced Brain capabilities. A key is required for:

- Adding a **second workspace**
- Connecting a **custom domain**
- Publishing, exporting agents, rotating org-scoped secrets
- Accessing the admin browser surface (\`/dashboard\`, \`/contacts\`, \`/deals\`)
  after \`link_workspace_owner({})\`

Get one at <https://app.seldonframe.com/settings/api> and
\`export SELDONFRAME_API_KEY=sk-…\`. The MCP will pick it up on next restart.

### Upgrading an anonymous workspace to your account

Once a key is set, \`link_workspace_owner({})\` attaches the active
workspace to your real account. This unlocks the admin URLs
(\`/dashboard\`, \`/contacts\`, \`/deals\`) for browser use after sign-in.
The MCP bearer token stays valid — no rotation needed.

---

**Docs:** <https://seldonframe.com/docs>  ·  **Homepage:** <https://seldonframe.com>  ·  **Pricing:** <https://seldonframe.com/#pricing>
`;

export const FIRST_CALL_BANNER = `🌑 Welcome to SeldonFrame. Your workspace is live — every URL above works right now. From here on, every tool response will include a \`next:\` array; follow it and you'll have a production-ready Business OS in under a minute.`;
