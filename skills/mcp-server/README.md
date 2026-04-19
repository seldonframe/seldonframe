# @seldonframe/mcp-server

Official SeldonFrame MCP server for Claude Code and Claude Desktop.

**Zero config to try.** The first time you run it, no API key is needed — the server boots in **guest mode** and simulates a full workspace (CRM, Cal.diy booking, Formbricks intake, Brain v2) locally. Build, explore, break things. Promote to the real `app.seldonframe.com` when you're ready.

## 60-second quickstart

```bash
# 1. From the repo root
cd skills/mcp-server && npm install

# 2. Register with Claude Code — no env vars
claude mcp add seldonframe -s user -- node "$(pwd)/src/index.js"

# 3. In Claude Code, try:
#    create_workspace({ name: "My Business OS" })
#    install_caldiy_booking({})
#    install_formbricks_intake({})
#    install_vertical_pack({ pack: "real-estate" })
#    query_brain({ question: "What should I do first?" })
```

That's it. Every tool returns a real, inspectable response backed by the actual `BLOCK.md` specs bundled with the server.

## Two modes

| Mode | Triggered by | What it does |
|---|---|---|
| **Guest** | `SELDONFRAME_API_KEY` is **not set** | Runs a local simulator. State is JSON under `~/.seldonframe/guest/`. No network calls. Great for trying the system, writing integration tests, or working offline. |
| **Connected** | `SELDONFRAME_API_KEY` is set | Every tool proxies to `https://app.seldonframe.com/api/v1`. Real persistence, real Brain, real domains, real billing. |

Switching modes requires nothing but setting (or unsetting) the env var and restarting the MCP server.

## Promoting a guest workspace

When you're ready to go live:

1. Get a key at <https://app.seldonframe.com/settings/api>.
2. In guest mode, run `claim_guest_workspace({})`. It writes `~/.seldonframe/guest/<id>.claim.json`.
3. Set `SELDONFRAME_API_KEY=sk_...`, restart the MCP, and upload that file via <https://app.seldonframe.com/settings/import> (or email it to `support@seldonframe.com`).

## Install via plugin manifest (one-shot)

The repo ships a `.claude-plugin/plugin.json` at the root. From inside Claude Code:

```
/plugin install <path-to-repo>
```

This registers the MCP server for you, with no env vars required for guest mode.

## Install via npm (once published)

```bash
claude mcp add seldonframe -s user -- npx -y @seldonframe/mcp-server@latest
```

Add `-e SELDONFRAME_API_KEY=sk_...` to start in connected mode immediately.

## Environment

- `SELDONFRAME_API_KEY` (optional) — Unset for guest mode. Set to enable connected mode.
- `SELDONFRAME_API_BASE` (optional) — Override the API base URL. Defaults to `https://app.seldonframe.com/api/v1`.

## Tools

`create_workspace`, `list_workspaces`, `switch_workspace`, `clone_workspace`, `seldon_it`, `list_automations`, `install_vertical_pack`, `install_caldiy_booking`, `install_formbricks_intake`, `query_brain`, `connect_custom_domain`, `export_agent`, `store_secret`, `list_secrets`, `rotate_secret`, `claim_guest_workspace`.

## Troubleshooting

**`Seldon API 401`** — Your `SELDONFRAME_API_KEY` is invalid or expired. Regenerate at <https://app.seldonframe.com/settings/api>, or unset the env var to fall back to guest mode.

**"No active guest workspace"** — Call `create_workspace({name:'...'})` first, or pass `workspace_id` explicitly to subsequent tools.

**Want to reset guest state?** Delete `~/.seldonframe/guest/`.
