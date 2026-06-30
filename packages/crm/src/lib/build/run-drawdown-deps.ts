// run drawdown — the REAL (production) deps for the per-run wallet gate + debit +
// earning. Kept out of run-drawdown.ts (pure orchestration) so its tests never
// import the DB. The run route imports buildRunDrawdownDeps() and passes it in.
//
// Wallet mode is resolved from the Stripe key (resolveBillingMode): a test key (or
// no key → inert) uses the 'test' wallet; a live key uses 'live'. This keeps the
// run drawdown on the SAME wallet the top-up funded.

import {
  debitWalletForRun,
  accrueBuilderEarning,
  getWalletBalanceMicros,
} from "@/lib/build/wallet-store";
import {
  isBillingEnabled,
  resolveBillingMode,
} from "@/lib/marketplace/billing/billing-mode";
import type { RunDrawdownDeps } from "@/lib/build/run-drawdown";

/** Build the production drawdown deps. billingEnabled + the wallet mode are read
 *  from process.env so the run path draws from the same wallet the top-up funded.
 *  When billing is OFF the wallet is never touched (today's money-safe behavior). */
export function buildRunDrawdownDeps(): RunDrawdownDeps {
  const env = process.env as Record<string, string | undefined>;
  const stripeMode = resolveBillingMode(env);
  return {
    billingEnabled: isBillingEnabled(env),
    getBalanceMicros: (orgId) => getWalletBalanceMicros(orgId, stripeMode),
    debitForRun: ({ orgId, runId, amountMicros }) =>
      debitWalletForRun({ orgId, runId, amountMicros, stripeMode }),
    accrueEarning: ({ sellerOrgId, runId, netMicros }) =>
      accrueBuilderEarning({ sellerOrgId, runId, netMicros, stripeMode }),
  };
}
