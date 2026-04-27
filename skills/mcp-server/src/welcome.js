export const VERSION = "1.0.1";

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

## The one command

\`\`\`text
create_workspace({ name: "Dental Clinic Laval", source: "https://example.com" })
\`\`\`

Returns a live subdomain, seeded CRM, and booking + intake pages ready to share.

## How to customize a workspace

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

The first workspace is free forever. A key is only required for:

- Adding a **second workspace**
- Connecting a **custom domain**
- Publishing, exporting agents, rotating org-scoped secrets

Get one at <https://app.seldonframe.com/settings/api> and
\`export SELDONFRAME_API_KEY=sk-…\`. The MCP will pick it up on next restart.

### Upgrading an anonymous workspace to your account

Once a key is set, \`link_workspace_owner({})\` attaches the active
workspace to your real account. This unlocks the admin URLs
(dashboard, contacts, deals) for browser use after sign-in. The MCP
bearer token stays valid — no rotation needed.

---

**Docs:** <https://app.seldonframe.com/docs>  ·  **Homepage:** <https://seldonframe.com>
`;

export const FIRST_CALL_BANNER = `🌑 Welcome to SeldonFrame. Your workspace is live — every URL above works right now. From here on, every tool response will include a \`next:\` array; follow it and you'll have a production-ready Business OS in under a minute.`;
