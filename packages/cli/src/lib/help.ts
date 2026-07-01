// help — the static usage text. Kept as one pure string so --help is instant and
// the command list stays in lockstep with the README.

export const HELP_TEXT = `seldonframe — terminal client for the SeldonFrame builder marketplace

USAGE
  seldonframe <command> [options] [--json]

COMMANDS
  login                                Paste + verify your key once (easiest setup)
  keys add --label <l> --key <wst_…>   Store a workspace bearer key (first = active)
  keys list                            List stored keys (masked)
  keys activate <label>                Make a stored key the active one
  keys remove <label>                  Remove a stored key

  discover -q <query> [--limit <n>]    Search the catalog → ranked agents + tools with price
  inspect --type <agent|tool> --id <id>
                                       Show an entry's input schema, pricing, and docs
  run --type <agent|tool> --id <id> -i <json|@file>
                                       Run an entry → result + honest billing
  status                               Your lifecycle: agents · earnings · balance · next action
  deploy --template <id>|--listing <slug> [--forward <e164>|--area <code>]
                                       Deploy an agent → connect link, or go live
  payout                               Withdraw your earnings to your bank (Stripe)
  wallet balance                       Show your prepaid wallet balance + accrued earnings
  wallet topup --amount <usd>          Fund your prepaid wallet (Stripe Checkout)

  --help, -h                           Show this help
  --version, -V                        Show the version

GLOBAL OPTIONS
  --json                               Emit raw JSON (for piping / scripting)

AUTH
  Commands that hit the API use your ACTIVE key as: Authorization: Bearer wst_…
  Easiest — paste + verify once:
    seldonframe login
  Or store it directly (mint at https://app.seldonframe.com/build/keys):
    seldonframe keys add --label main --key wst_…
  Or skip storage with the env var (great for CI / one-off):
    SELDONFRAME_API_KEY=wst_… seldonframe wallet balance

ENVIRONMENT
  SELDONFRAME_API_KEY        Use this key instead of the stored one (zero-setup / CI)
  SELDONFRAME_API_BASE_URL   Override the API base (default https://app.seldonframe.com)
  SELDONFRAME_CONFIG_DIR     Override where keys are stored

EXAMPLES
  seldonframe keys add --label main --key wst_xxx
  seldonframe discover -q "send an email to a customer" --limit 5
  seldonframe inspect --type tool --id GMAIL_SEND_EMAIL
  seldonframe run --type agent --id ace-receptionist -i '{"message":"Do you do emergency calls?"}'
  seldonframe run --type tool --id GMAIL_SEND_EMAIL -i @payload.json
  seldonframe wallet balance --json
`;
