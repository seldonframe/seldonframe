// marketplace — the API-backed commands: discover / inspect / run / wallet.
// Each takes an ApiClient (injectable → testable with a fake fetch) + a Writer,
// validates flags, calls the LIVE endpoint, and prints either the human render
// or raw JSON (--json). Errors map through errorToMessage (honest 401/402 hints).
//
// MONEY-SAFETY: `run` only POSTs to the existing /api/v1/build/run endpoint,
// which records cost but does NOT charge (the wallet drawdown is server-side and
// gated). The CLI relays the server's `billing.charged` verbatim — it invents no
// charge and adds no new money path.

import type { ParsedArgs } from "../lib/args.js";
import type { Writer } from "../lib/output.js";
import { emit } from "../lib/output.js";
import type { ApiClient } from "../lib/api-client.js";
import { pollUntilFunded } from "../lib/poll.js";
import {
  formatDiscover,
  formatInspect,
  formatRun,
  formatWallet,
} from "../lib/format.js";
import { resolveInput, errorToMessage } from "../lib/io.js";

/** Validate the shared { type, id } flags. Returns the typed pair or an error. */
function readTypeAndId(args: ParsedArgs): { type: "agent" | "tool"; id: string } | string {
  const type = (args.flags.type ?? "").trim();
  const id = (args.flags.id ?? "").trim();
  if (type !== "agent" && type !== "tool") {
    return '--type must be "agent" or "tool".';
  }
  if (!id) return "--id <id> is required.";
  return { type, id };
}

export async function runDiscoverCommand(
  args: ParsedArgs,
  client: ApiClient,
  writer: Writer,
): Promise<number> {
  const query = (args.flags.query ?? args.positionals[0] ?? "").trim();
  let limit: number | undefined;
  if (args.flags.limit !== undefined) {
    const n = Number(args.flags.limit);
    if (!Number.isFinite(n) || n <= 0) {
      writer.err("--limit must be a positive number.");
      return 1;
    }
    limit = Math.floor(n);
  }

  try {
    const resp = await client.discover(query, limit);
    emit(writer, args.json, resp, formatDiscover);
    return 0;
  } catch (err) {
    writer.err(errorToMessage(err));
    return 1;
  }
}

export async function runInspectCommand(
  args: ParsedArgs,
  client: ApiClient,
  writer: Writer,
): Promise<number> {
  const parsed = readTypeAndId(args);
  if (typeof parsed === "string") {
    writer.err(parsed);
    return 1;
  }
  try {
    const view = await client.inspect(parsed.type, parsed.id);
    emit(writer, args.json, view, formatInspect);
    return 0;
  } catch (err) {
    writer.err(errorToMessage(err));
    return 1;
  }
}

export async function runRunCommand(
  args: ParsedArgs,
  client: ApiClient,
  writer: Writer,
): Promise<number> {
  const parsed = readTypeAndId(args);
  if (typeof parsed === "string") {
    writer.err(parsed);
    return 1;
  }

  let input: Record<string, unknown>;
  try {
    input = resolveInput(args.flags.input);
  } catch (err) {
    writer.err(errorToMessage(err));
    return 1;
  }

  try {
    const result = await client.run(parsed.type, parsed.id, input);
    emit(writer, args.json, result, formatRun);
    // A non-completed (e.g. error) run that came back 200 still exits non-zero so
    // scripts can detect failure; "completed" → 0.
    return result.status === "completed" ? 0 : 1;
  } catch (err) {
    writer.err(errorToMessage(err));
    return 1;
  }
}

export async function runWalletCommand(
  args: ParsedArgs,
  client: ApiClient,
  writer: Writer,
): Promise<number> {
  if (args.subcommand === "topup") {
    const amountUsd = Number(args.flags.amount);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      writer.err("Usage: seldonframe wallet topup --amount <usd>  (e.g. --amount 20)");
      return 1;
    }
    const res = await client.walletTopup(amountUsd);
    if (!res.ok || !res.checkoutUrl) {
      writer.err(`Top-up unavailable (${res.reason ?? "unknown"}). Fund at https://app.seldonframe.com/build/wallet.`);
      return 1;
    }
    const start = (await client.walletBalance()).balance.value;
    writer.out(`Open this to pay $${amountUsd.toFixed(2)}:\n  ${res.checkoutUrl}`);
    writer.out("Waiting for payment…");
    const funded = await pollUntilFunded({
      startUsd: start,
      getBalanceUsd: async () => (await client.walletBalance()).balance.value,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      maxAttempts: 40,
    });
    writer.out(funded ? `✓ funded $${amountUsd.toFixed(2)}.` : "Still processing — check https://app.seldonframe.com/build/wallet.");
    return 0;
  }

  // The only other wallet subcommand is `balance`. Anything else is a usage error.
  if (args.subcommand && args.subcommand !== "balance") {
    writer.err(`Unknown wallet subcommand "${args.subcommand}". Try: seldonframe wallet balance.`);
    return 1;
  }
  try {
    const w = await client.walletBalance();
    emit(writer, args.json, w, formatWallet);
    return 0;
  } catch (err) {
    writer.err(errorToMessage(err));
    return 1;
  }
}
