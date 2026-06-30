// format — pure text renderers for the human (non-JSON) output. Each takes a
// typed API response and returns the string the CLI prints. Pure: no console, no
// color libs (deps stay minimal) — just deterministic strings, so they unit-test
// with plain assertions. The `--json` path bypasses these (it prints the raw
// response verbatim).

import type {
  CatalogPrice,
  DiscoverResponse,
  InspectView,
  RunResult,
  WalletBalance,
  Money,
} from "./api-client.js";
import { maskKey } from "./mask.js";

/** Render a catalog price as a short human string ($0.10/call, $10/booking, free). */
export function formatPrice(price: CatalogPrice | undefined): string {
  if (!price || typeof price.amountCents !== "number" || price.amountCents <= 0) {
    return "free";
  }
  const dollars = (price.amountCents / 100).toFixed(2);
  if (price.type === "per_call") return `$${dollars}/call`;
  if (price.type === "per_result") return `$${dollars}/result`;
  if (price.type === "per_outcome") {
    return `$${dollars}/${price.outcomeType ?? "outcome"}`;
  }
  return `$${dollars}`;
}

/** Render a Monid money value ({ value, currency }) as "$20.00 USD". */
export function formatMoney(m: Money | undefined): string {
  const value = m && typeof m.value === "number" ? m.value : 0;
  const currency = m?.currency ?? "USD";
  return `$${value.toFixed(2)} ${currency}`;
}

/** discover → a ranked list, one entry per line, each with its price + type. */
export function formatDiscover(resp: DiscoverResponse): string {
  const results = Array.isArray(resp?.results) ? resp.results : [];
  if (results.length === 0) {
    return "No results.";
  }
  const lines = results.map((r, i) => {
    const n = String(i + 1).padStart(2, " ");
    const tag = r.type === "tool" ? `tool${r.provider ? `:${r.provider}` : ""}` : "agent";
    const head = `${n}. ${r.name}  [${tag}]  ${formatPrice(r.price)}`;
    const idLine = `    id: ${r.id}`;
    const desc = r.description ? `    ${r.description}` : "";
    return [head, idLine, desc].filter(Boolean).join("\n");
  });
  return [`${results.length} result(s):`, "", ...lines].join("\n");
}

/** inspect → name/type/price + the input schema fields + docs link. */
export function formatInspect(view: InspectView): string {
  const out: string[] = [];
  out.push(`${view.name}  [${view.type}]`);
  out.push(`id:    ${view.id}`);
  if (view.provider) out.push(`from:  ${view.provider}`);
  out.push(`price: ${formatPrice(view.price)}`);
  if (view.description) out.push(`\n${view.description}`);

  const props = view.inputSchema?.properties ?? {};
  const required = new Set(view.inputSchema?.required ?? []);
  const names = Object.keys(props);
  out.push("\nInput:");
  if (names.length === 0) {
    out.push("  (free-form object — see docs)");
  } else {
    for (const name of names) {
      const field = props[name] as { type?: string; description?: string } | undefined;
      const req = required.has(name) ? " (required)" : "";
      const ftype = field?.type ? `: ${field.type}` : "";
      const fdesc = field?.description ? ` — ${field.description}` : "";
      out.push(`  ${name}${ftype}${req}${fdesc}`);
    }
  }

  if (Array.isArray(view.capabilities) && view.capabilities.length > 0) {
    out.push(`\nCapabilities: ${view.capabilities.join(", ")}`);
  }
  if (view.docUrl) out.push(`\nDocs: ${view.docUrl}`);
  return out.join("\n");
}

/** run → status + output + the honest billing block (charged reflects the API). */
export function formatRun(result: RunResult): string {
  const out: string[] = [];
  out.push(`run:    ${result.runId}`);
  out.push(`status: ${result.status}`);

  if (result.status !== "completed" && result.error) {
    out.push(`error:  ${result.error}`);
  }

  if (result.output !== undefined) {
    out.push("\nOutput:");
    out.push(indent(stringifyOutput(result.output)));
  }

  const b = result.billing;
  if (b) {
    out.push("\nBilling:");
    out.push(`  cost:     $${(b.amountCents / 100).toFixed(2)} (${b.calculatedCost} micro-USD)`);
    out.push(`  charged:  ${b.charged ? "yes" : "no"}`);
    if (!b.charged) {
      out.push(`            (cost recorded, not charged${b.recorded ? "" : " — not metered"})`);
    }
    if (typeof b.balanceMicros === "number") {
      out.push(`  balance:  $${(b.balanceMicros / 1_000_000).toFixed(2)} remaining`);
    }
  }
  return out.join("\n");
}

/** wallet balance → balance + accrued earnings. */
export function formatWallet(w: WalletBalance): string {
  return [
    "Wallet",
    `  balance:  ${formatMoney(w.balance)}`,
    `  earnings: ${formatMoney(w.earnings)} (accrued, before payout)`,
  ].join("\n");
}

/** keys list → a masked table; the active key is marked. */
export type StoredKeyView = { label: string; masked: string; active: boolean };

export function formatKeysList(keys: StoredKeyView[]): string {
  if (!Array.isArray(keys) || keys.length === 0) {
    return "No keys stored. Add one:\n  seldonframe keys add --label <name> --key wst_…";
  }
  const lines = keys.map((k) => {
    const marker = k.active ? "*" : " ";
    return `${marker} ${k.label}  ${k.masked}`;
  });
  return ["Stored keys (* = active):", "", ...lines].join("\n");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function stringifyOutput(output: unknown): string {
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

function indent(s: string, pad = "  "): string {
  return s
    .split("\n")
    .map((line) => `${pad}${line}`)
    .join("\n");
}

/** Re-export so command code can mask without importing two modules. */
export { maskKey };
