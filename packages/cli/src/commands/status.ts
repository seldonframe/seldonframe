import type { ApiClient } from "../lib/api-client.js";
import type { Writer } from "../lib/output.js";
import type { ParsedArgs } from "../lib/args.js";

export async function runStatusCommand(args: ParsedArgs, client: ApiClient, writer: Writer): Promise<number> {
  if (!client.hasKey()) {
    writer.err("No key yet. Run `seldonframe login`.");
    return 1;
  }
  const state = await client.workspaceState();
  const b = state.builder;
  if (args.json) {
    writer.out(JSON.stringify(b ?? {}, null, 2));
    return 0;
  }
  if (!b) {
    writer.out("No builder state yet — run `seldonframe login`, then ask your agent to build an agent.");
    return 0;
  }
  writer.out("SeldonFrame — your builder lifecycle");
  for (const a of b.agents ?? []) {
    writer.out(`  • ${a.name} (${a.slug}) — ${a.live ? "live" : a.stage}`);
  }
  const ps = b.earnings?.payout_status;
  const payoutLabel =
    typeof ps === "object" && ps !== null
      ? `$${ps.available_usd.toFixed(2)} ready to withdraw — run \`seldonframe payout\``
      : ps === "connect_stripe"
        ? "connect your bank to withdraw"
        : ps === "below_min"
          ? "below the $10 withdrawal minimum"
          : ps === "coming_soon" || !ps
            ? "withdrawals coming soon"
            : String(ps);
  writer.out(`  earnings: $${(b.earnings?.accrued_usd ?? 0).toFixed(2)} (${payoutLabel})`);
  writer.out(`  balance:  $${(b.wallet_balance_usd ?? 0).toFixed(2)}`);
  if (b.fund_hint) writer.out(`  ${b.fund_hint}`);
  if (b.next_action) writer.out(`\n→ Next: ${b.next_action}`);
  return 0;
}
