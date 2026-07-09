// Guide registry — the long-form article surface of the content engine.
// Each article is a Guide data object in its own file (loop-friendly: the weekly
// content loop writes guides/<slug>.ts + adds one import line here). Pure data +
// pure lookups so it's unit-testable and importable from server components,
// sitemap, llms.txt and the /guides/<slug>.md twin routes alike.
//
// Reuses LAST_UPDATED from alternative-pages.ts so one date bump refreshes the
// "facts checked" byline across every SEO surface at once.

import { LAST_UPDATED } from "../alternative-pages";
import type { Guide, GuideCluster } from "./types";

import { guide as whatIsSpeedToLead } from "./what-is-speed-to-lead";
import { guide as fiveMinuteRule } from "./the-5-minute-rule-for-lead-response";
import { guide as avgResponseTime } from "./average-lead-response-time-by-industry";
import { guide as respondFaster } from "./how-to-respond-to-leads-faster";
import { guide as textOrCall } from "./text-or-call-a-new-lead";
import { guide as whyLeadsGoCold } from "./why-leads-go-cold";

export { LAST_UPDATED };
export type { Guide, GuideCluster, GuideSection, GuideFaq, GuideSource, GuideIntent } from "./types";

/** Human-readable label for each cluster, used on the /guides hub. */
export const CLUSTER_LABELS: Record<GuideCluster, string> = {
  "speed-to-lead": "Speed to lead & follow-up",
  "no-shows": "No-shows & reminders",
  "ai-receptionist": "AI receptionists & phone",
  "service-faq": "FAQs & customer questions",
  booking: "Online booking",
  "ai-visibility": "AI visibility & GEO",
};

export const GUIDES: Guide[] = [
  whatIsSpeedToLead,
  fiveMinuteRule,
  avgResponseTime,
  respondFaster,
  textOrCall,
  whyLeadsGoCold,
];

export function getGuide(slug: string): Guide {
  const found = GUIDES.find((g) => g.slug === slug);
  if (!found) throw new Error(`unknown guide slug: ${slug}`);
  return found;
}

export function allGuideSlugs(): string[] {
  return GUIDES.map((g) => g.slug);
}

export function guidesInCluster(cluster: GuideCluster): Guide[] {
  return GUIDES.filter((g) => g.cluster === cluster);
}

/** Clusters that actually have at least one published guide, label + members. */
export function populatedClusters(): { cluster: GuideCluster; label: string; guides: Guide[] }[] {
  const seen = new Set<GuideCluster>();
  const order: GuideCluster[] = [];
  for (const g of GUIDES) {
    if (!seen.has(g.cluster)) {
      seen.add(g.cluster);
      order.push(g.cluster);
    }
  }
  return order.map((cluster) => ({ cluster, label: CLUSTER_LABELS[cluster], guides: guidesInCluster(cluster) }));
}
