// Pure Markdown renderer for /charts/crm-pricing-index.md — the agent-citable
// twin of the CRM Pricing Index. Renders the full data table (every
// registry vendor, at the default 2,000-contacts/1-seat size) plus
// methodology and last-verified dates. Mirrors competitor-pricing-markdown.ts.

import { PRICING, LAST_UPDATED } from "./competitor-pricing";
import { buildVendorSeries, sfBandForVendor, type BusinessSize } from "./pricing-index";

const BASE = "https://www.seldonframe.com";
const DEFAULT_SIZE: BusinessSize = { contacts: 2_000, seats: 1 };

export function renderPricingIndexMarkdown(): string {
  const series = buildVendorSeries(DEFAULT_SIZE);
  const L: string[] = [];

  L.push("# The CRM Pricing Index — What 25 CRMs Really Cost");
  L.push("");
  L.push(`> Real monthly cost vs business size for the CRMs and AI front-office tools local businesses actually consider. Re-verified monthly. Registry last updated: ${LAST_UPDATED}.`);
  L.push("");
  L.push(`HTML version: ${BASE}/charts/crm-pricing-index`);
  L.push("");
  L.push("Reviewed by Maxime Houle, Founder, SeldonFrame — self-interest disclosed: SeldonFrame is one of the vendors in this table.");
  L.push("");
  L.push("## Methodology");
  L.push("");
  L.push("Prices are re-verified monthly by an automated check against each vendor's public pricing page. Every number traces to that vendor's own published plan price; quote-gated vendors are marked accordingly rather than assigned an invented number. SeldonFrame's comparison band uses the tier closest to what each vendor implies — a solo/DIY tool compares against Builder ($29/mo), an agency-reseller platform compares against the Agency ladder ($99–$299/mo) — never our cheapest tier against a competitor's most expensive.");
  L.push("");
  L.push(`## Cost table (at ${DEFAULT_SIZE.contacts.toLocaleString()} contacts, ${DEFAULT_SIZE.seats} seat)`);
  L.push("");
  L.push("| Vendor | Est. monthly cost | Assumption | SeldonFrame comparison band | Last verified | Source |");
  L.push("|---|---|---|---|---|---|");
  for (const s of series) {
    const pricing = PRICING.find((p) => p.slug === s.slug)!;
    const point = s.points[0];
    const band = sfBandForVendor(s.slug, DEFAULT_SIZE);
    const cost = point.quoteGated || point.costMonthly === null ? "Quote-gated" : `$${point.costMonthly}/mo`;
    L.push(
      `| ${s.name} | ${cost} | ${point.assumption} | $${band.low}–$${band.high}/mo | ${pricing.verified} | [source](${pricing.pricingUrl}) |`,
    );
  }
  L.push("");
  L.push("## Notes");
  L.push("");
  L.push("- Prices marked \"Quote-gated\" have no public self-serve number — treat any third-party reported figure as unverified, not a confirmed price.");
  L.push("- Per-seat and per-contact vendors are estimated honestly at the stated assumption; the interactive chart at the HTML link above lets you re-run this at 500/2,000/10,000/50,000 contacts and 1/3/10 seats.");
  L.push("- SeldonFrame's own price ladder: Builder $29/mo, Managed $49/mo, Agency Starter $99/mo, Agency Growth $199/mo, Agency Scale $299/mo — see /pricing for the live, current ladder.");
  L.push("");

  return L.join("\n");
}
