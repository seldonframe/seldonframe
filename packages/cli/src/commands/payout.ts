// payout — withdraw accrued marketplace earnings to the builder's bank. Calls the
// money-safe POST /api/v1/build/payout and renders the server's verdict honestly.
// The CLI does NO money math and opens no charge path — it relays the PayoutResult.

import type { ParsedArgs } from "../lib/args.js";
import type { Writer } from "../lib/output.js";
import type { ApiClient } from "../lib/api-client.js";
import { errorToMessage } from "../lib/io.js";

export async function runPayoutCommand(
  args: ParsedArgs,
  client: ApiClient,
  writer: Writer,
): Promise<number> {
  if (!client.hasKey()) {
    writer.err("No key yet. Run `seldonframe login`.");
    return 1;
  }

  let result;
  try {
    result = await client.payout();
  } catch (err) {
    writer.err(errorToMessage(err));
    return 1;
  }

  if (args.json) {
    writer.out(JSON.stringify(result, null, 2));
    return result.status === "paid" ? 0 : result.status === "disabled" ? 1 : 0;
  }

  switch (result.status) {
    case "paid":
      writer.out(`✓ Paid $${result.amountUsd.toFixed(2)} to your bank (arrives in ~2 business days).`);
      return 0;
    case "connect_required":
      writer.out("Connect your bank to withdraw your earnings:");
      writer.out(`  ${result.onboardingUrl ?? "https://app.seldonframe.com/build/wallet"}`);
      return 0;
    case "below_min":
      writer.out(
        `You have $${result.withdrawableUsd.toFixed(2)} — the minimum withdrawal is $${result.minUsd.toFixed(2)}. Earn a bit more, then withdraw.`,
      );
      return 0;
    case "disabled":
      writer.err("Withdrawals aren't enabled on this workspace yet.");
      return 1;
  }
}
