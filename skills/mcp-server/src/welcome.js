export const WELCOME_MARKDOWN = `# SeldonFrame MCP

Your AI-native Business OS — CRM, booking, intake forms, and Brain v2 intelligence, all controllable from chat.

---

## Running in **guest mode** — no key required

You can start building right now. No signup, no API key, no config. Every tool call runs locally against a private simulator in \`~/.seldonframe/guest/\`. Create workspaces, install blocks, query Brain — it all just works.

## Try this first

\`\`\`text
create_workspace({ name: "My Business OS" })
install_caldiy_booking({})
install_formbricks_intake({})
install_vertical_pack({ pack: "real-estate" })
query_brain({ question: "What's my next best action?" })
\`\`\`

## What's included out of the box

- **CRM** — contacts, deals, activities, custom pipelines
- **Cal.diy booking** — full scheduling block with event types & availability
- **Formbricks intake** — conditional forms with contact sync
- **Brain v2** — local heuristics that inspect your state and surface next actions
- **Vertical packs** — real-estate agency (more coming)

## When you're ready to go live

Guest state is local-only. To persist to \`app.seldonframe.com\`, get a free key at <https://app.seldonframe.com/settings/api>, then:

\`\`\`bash
export SELDONFRAME_API_KEY=sk-...
\`\`\`

Or migrate an existing guest workspace with:

\`\`\`text
claim_guest_workspace({ workspace_id: "wsp_..." })
\`\`\`

---

**Docs:** <https://app.seldonframe.com/docs>  ·  **Homepage:** <https://seldonframe.com>
`;

export const GUEST_FIRST_CALL_BANNER = `🌒 **SeldonFrame guest mode** — this workspace lives at \`~/.seldonframe/guest/\` on your machine. Run \`claim_guest_workspace\` once you have an API key to promote it to \`app.seldonframe.com\`.`;
