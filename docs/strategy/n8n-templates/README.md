# SeldonFrame n8n Templates

Five importable n8n workflow templates that call SeldonFrame's public API. Each
one is a distribution surface: someone building automations in n8n discovers
SeldonFrame as "the endpoint that already does CRM + booking + agent + SMS +
email," without ever touching our own product UI first.

SF stays the source of truth that pushes outward (the endpoint being called).
n8n is the user's middleware, not ours — no Zapier/Make dependency created on
our side, no violation of the "no middleware" positioning in CLAUDE.md §1b.

## The five templates

| File | One-line value |
| --- | --- |
| `speed-to-lead-sms.json` | New lead comes in from any form/ad webhook → instant SMS via SF in seconds. The "one booked job pays for it" speed-to-lead play — the #1 reason leads go cold is a slow first touch. |
| `lead-to-agent-reply.json` | Any inbound question, from any surface with a webhook, gets answered by a live SF agent and the reply is returned synchronously. Shows an SF agent working as an API brain behind literally any UI. |
| `sheets-row-to-email.json` | Poll a Google Sheet every 15 minutes and fire an SF email per new/matching row — for teams whose lead intake still lives in a spreadsheet. |
| `booking-intake-to-sf.json` | Typeform/JotForm submission → mapped straight into an SF booking, no manual re-entry. |
| `daily-conversation-digest.json` | Daily 8am pull of SF agent conversation activity, formatted into a Slack-postable digest. The polling pattern — see "No outbound webhooks" below. |

## Import into n8n

1. Open your n8n instance → **Workflows** → **Import from File**.
2. Select the `.json` file for the template you want.
3. n8n will show you the node graph; it imports inactive (`"active": false`) by
   design — review before turning it on.
4. Set the environment variables / credentials below, then click into the SF
   HTTP Request node(s) to confirm the URL and body match your setup.
5. Activate the workflow.

## Environment variables / credentials to set

These templates use `n8n` expression `$env.*` references rather than hardcoded
secrets or a bundled credential object, so nothing sensitive ships in the JSON
file itself.

| Variable | Used by | Where to get it |
| --- | --- | --- |
| `SF_ORG_ID` | speed-to-lead-sms, sheets-row-to-email, daily-conversation-digest | Your SeldonFrame workspace's org id (Settings → API, or ask in your workspace). |
| `SF_API_KEY` | speed-to-lead-sms, sheets-row-to-email, daily-conversation-digest | An SF API key with SMS/email/agents scope. |
| `SF_AGENT_SLUG` | lead-to-agent-reply | The public slug of the live agent you want to hit (`/api/v1/public/agent/{slug}/turn`). |
| `SF_LEADS_SHEET_ID` / `SF_LEADS_SHEET_TAB` | sheets-row-to-email | Your Google Sheet's document id and tab name. Requires a Google Sheets OAuth2 credential configured separately in n8n (standard n8n credential, not an SF one). |
| `SF_SLACK_WEBHOOK_URL` | daily-conversation-digest | A Slack incoming-webhook URL for the channel you want the digest posted to. (Swap in n8n's native Slack node + credential if you prefer OAuth over an incoming webhook.) |

Two endpoints need **no auth at all** because SF resolves the org from the
request host/slug: `POST /api/v1/public/agent/{slug}/turn` and
`POST /api/v1/public/bookings`. Don't add `x-org-id`/`x-api-key` headers to
those two — they're intentionally anonymous-callable.

## No outbound webhooks — the honest constraint

SeldonFrame does not currently push webhooks out to third parties. There is no
"when a new lead comes in on SF" trigger you can wire up natively. Any
"reacting to something that happened inside SF" template — like the daily
digest — has to **poll** `GET /api/v1/agents` on a schedule instead of
receiving a push. That's a real latency tradeoff (up to one polling interval
of delay) and this doc states it plainly rather than pretending a push
integration exists.

## MCP endpoint (not templated here)

SeldonFrame also exposes an MCP endpoint at `https://mcp.seldonframe.com/v1`
(Bearer `wst_...`) for agent-native tool access. n8n's HTTP Request node can't
speak MCP directly, so it isn't wrapped in one of these five templates — but
if you're building with an MCP-aware client instead of n8n, that's the
richer integration surface.

## Before you submit or ship these

Every file here is import-validated for JSON syntax and n8n's workflow schema
shape (nodes, connections, trigger + SF HTTP node present in each). They have
**not** been executed against a live n8n instance or a live SeldonFrame
workspace end-to-end — we can't run n8n in this environment. Never-lies rule:
import-test each template in a real n8n instance against a real SF workspace
before submitting to the gallery or telling a customer it works.
