# @seldonframe/mcp-server

Official SeldonFrame MCP server for Claude Code and Claude Desktop.

**One command, one real workspace.** The first time you run it, no API key is needed. Say `create_workspace({ name: "Dental Clinic Laval" })` and the server mints a real hosted workspace on `dental-clinic-laval.app.seldonframe.com` — with CRM, Cal.diy booking, Formbricks intake, and Brain v2 pre-installed — and returns live URLs. No signup wall, no "guest mode", no claim step.

## 60-second quickstart

```bash
# 1. From the repo root
cd skills/mcp-server && npm install

# 2. Register with Claude Code — no env vars needed
claude mcp add seldonframe -s user -- node "$(pwd)/src/index.js"

# 3. In Claude Code, just ask:
#    create_workspace({ name: "My Business OS" })
```

That call returns something like:

```json
{
  "workspace": { "id": "wsp_…", "slug": "my-business-os", "tier": "free" },
  "urls": {
    "dashboard": "https://my-business-os.app.seldonframe.com",
    "book": "https://my-business-os.app.seldonframe.com/book",
    "intake": "https://my-business-os.app.seldonframe.com/intake"
  },
  "installed": ["crm", "caldiy-booking", "formbricks-intake", "brain-v2"],
  "next": [ "…" ]
}
```

Every subsequent tool response includes a `next:` array — follow the rails.

## How auth works

| Situation | What happens |
|---|---|
| First ever call | `create_workspace` POSTs with no auth. Server mints a workspace + bearer token. MCP stores the token in `~/.seldonframe/device.json`. |
| Subsequent calls | MCP sends `Authorization: Bearer <workspace token>` automatically. |
| `SELDONFRAME_API_KEY` set | Takes precedence over device tokens. Unlocks Pro capabilities. |

You never have to juggle modes. The first workspace is free forever.

## When you need `SELDONFRAME_API_KEY`

- Adding a **second workspace**
- Connecting a **custom domain**
- **Full Brain v2** intelligence (heuristic Brain is always free)
- Publishing, exporting, org-scoped secret rotation

Get one at <https://app.seldonframe.com/settings/api>, then:

```bash
export SELDONFRAME_API_KEY=sk-…
```

Restart the MCP server. Your existing workspaces continue to work untouched.

## Install via plugin manifest (one-shot)

The repo ships a `.claude-plugin/plugin.json` at the root. From inside Claude Code:

```
/plugin install <path-to-repo>
```

## Install via npm (once published)

```bash
claude mcp add seldonframe -s user -- npx -y @seldonframe/mcp-server@latest
```

## Environment

- `SELDONFRAME_API_KEY` *(optional)* — Enables Pro capabilities (second workspace, custom domains, full Brain v2).
- `SELDONFRAME_API_BASE` *(optional)* — Override the API base URL. Defaults to `https://app.seldonframe.com/api/v1`.

## Tools

**Workspace:** `create_workspace`, `list_workspaces`, `switch_workspace`, `clone_workspace`, `link_workspace_owner`, `get_workspace_snapshot`.
**Blocks:** `install_caldiy_booking`, `install_formbricks_intake`, `install_vertical_pack`.
**Customize (typed, no backend LLM):** `update_landing_content`, `customize_intake_form`, `configure_booking`, `update_theme`.
**Soul:** `fetch_source_for_soul`, `submit_soul`.
**Ops:** `list_automations`, `connect_custom_domain`, `export_agent`, `store_secret`, `list_secrets`, `rotate_secret`.

### Architecture: zero backend LLM cost

Natural-language reasoning happens in the MCP session (Claude Code on the user's side). The backend only accepts **structured** commands and applies them deterministically. There is no `seldon_it` endpoint that parses prompts server-side; the old `query_brain` is replaced by `get_workspace_snapshot`, which returns raw state for Claude to reason over. Seldon spends $0 on LLM for the free tier — the user's Claude Code subscription is the reasoning engine.

### Soul compilation (zero cost to Seldon)

Soul compilation runs in **your** Claude Code session, not on Seldon's servers:

1. `fetch_source_for_soul({ url })` — returns up to 256KB of normalized text.
2. You (the agent) extract a structured Soul object.
3. `submit_soul({ soul })` — persists it to the workspace.

## Troubleshooting

**`Seldon API 401`** — Your `SELDONFRAME_API_KEY` is invalid or expired. Regenerate at <https://app.seldonframe.com/settings/api>, or unset the env var to fall back to your device token.

**`Seldon API 402`** — You tried a Pro capability without a key. Set `SELDONFRAME_API_KEY` and restart.

**Want to reset device state?** Delete `~/.seldonframe/device.json`. Your hosted workspaces stay live at `app.seldonframe.com`; only the local tokens are cleared.
