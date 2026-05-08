import { PlaceholderTab } from "../placeholder-tab";

export default function RevenueTabPage() {
  return (
    <PlaceholderTab
      title="Revenue"
      ship="v1.35.4"
      summary="MRR, ARR, churn, LTV — Stripe-sourced. The deep version of the Overview's hero numbers."
      bullets={[
        "MRR over time (line chart, weekly + monthly granularity)",
        "MRR breakdown by plan (Free → Growth → Scale)",
        "Expansion vs contraction MRR (upgrades / downgrades / churn)",
        "Cohort retention curves (signups by month, % retained at week 1/4/12/26)",
        "Conversion funnel: signup → first agent built → first conversation → upgrade to paid",
        "LTV by acquisition channel (when we wire UTM tracking)",
        "Failed payment dashboard (Stripe past-due subscriptions, recovery rate)",
        "Note: Overview's MRR card is a fast local approximation; this tab pulls Stripe API directly for source-of-truth numbers.",
      ]}
    />
  );
}
