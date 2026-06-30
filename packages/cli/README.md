# @seldonframe/cli

A terminal client for the **SeldonFrame builder marketplace**. Discover, inspect, and run agents and tools, and check your prepaid wallet — straight from the shell, or from an agent framework that shells out.

It's the command-line twin of the SeldonFrame MCP `discover → inspect → run` flow: same endpoints, same auth, same honest pricing.

```bash
npm install -g @seldonframe/cli
```

Then teach your IDE agent the whole build-and-sell flow:

```
set up https://seldonframe.com/SKILL.md
```

## Auth

Every command that hits the API uses your **active workspace bearer key** as `Authorization: Bearer wst_…`.

1. Mint a key (revealed once) at **https://app.seldonframe.com/build/keys**.
2. Store it:

```bash
seldonframe keys add --label main --key wst_xxxxxxxx
```

The first key you add becomes active. Keys are stored locally (see [Key storage](#key-storage)) and are **never printed in full** — only ever masked (`wst_…xxxx`).

## Commands

| Command | What it does | Endpoint |
| --- | --- | --- |
| `keys add --label <l> --key <wst_…>` | Store a key (first = active) | local |
| `keys list` | List stored keys (masked) | local |
| `keys activate <label>` | Switch the active key | local |
| `keys remove <label>` | Remove a key | local |
| `discover -q <query> [--limit <n>]` | Search the catalog → ranked agents + tools, each with its price | `POST /api/v1/build/discover` |
| `inspect --type <agent\|tool> --id <id>` | Show an entry's input schema, pricing, and docs | `POST /api/v1/build/inspect` |
| `run --type <agent\|tool> --id <id> -i <json\|@file>` | Run an entry → result + honest billing | `POST /api/v1/build/run` |
| `wallet balance` | Your prepaid wallet balance + accrued earnings | `GET /api/v1/build/wallet/balance` |
| `--version`, `-V` | Print the version | — |
| `--help`, `-h` | Print usage | — |

Add `--json` to any command to emit raw JSON for piping/scripting.

## Examples

```bash
# Search the marketplace
seldonframe discover -q "send an email to a customer" --limit 5

# Look at how to call a tool
seldonframe inspect --type tool --id GMAIL_SEND_EMAIL

# Run an agent with an inline JSON message
seldonframe run --type agent --id ace-receptionist \
  -i '{"message":"Do you do emergency calls?"}'

# Run a tool with input from a file
seldonframe run --type tool --id GMAIL_SEND_EMAIL -i @payload.json

# Check your wallet (as JSON)
seldonframe wallet balance --json
```

### How runs are billed

A `run` returns a `billing` block. The CLI relays it **exactly as the API reports it** — it invents no charge:

```
Billing:
  cost:     $0.10 (100000 micro-USD)
  charged:  no
            (cost recorded, not charged)
```

`charged` reflects the real wallet/flag state from the server. Successful runs accrue cost; **errored runs are never billed**. When your prepaid wallet can't cover a run, the API returns `402` and the run does **not** execute — the CLI prints a top-up hint.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `SELDONFRAME_API_BASE_URL` | Override the API base | `https://app.seldonframe.com` |
| `SELDONFRAME_CONFIG_DIR` | Override where keys are stored | OS config dir (below) |

## Key storage

Keys live in a single JSON file, `keys.json`, under your OS config directory:

- **Windows** — `%APPDATA%\seldonframe\keys.json`
- **macOS** — `~/Library/Application Support/seldonframe/keys.json`
- **Linux** — `$XDG_CONFIG_HOME/seldonframe/keys.json` (or `~/.config/seldonframe/keys.json`)

The file is written with `0600` permissions where the OS honors it. The CLI never echoes a full key to stdout, stderr, or `--json` output.

## Errors

| Status | What you'll see |
| --- | --- |
| no key | `No active key. Run seldonframe keys add …` |
| `401` | `Unauthorized — run seldonframe keys add with a fresh wst_ key` |
| `402` | `Insufficient balance — top up at app.seldonframe.com/build/wallet` |
| `429` | `Rate limited. Wait a moment and try again.` |
| offline / bad base URL | `Could not reach <base> … Check your connection or SELDONFRAME_API_BASE_URL.` |

## Requirements

Node.js **>= 18** (uses the built-in `fetch`). Zero runtime dependencies.

## License

MIT
