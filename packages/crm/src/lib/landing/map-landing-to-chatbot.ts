// packages/crm/src/lib/landing/map-landing-to-chatbot.ts
//
// Pure mapping helper — turns the R1 landing payload (real FAQ +
// services already generated for the landing page) into the shape
// createAgent()/AgentBlueprint expects for the auto-created chatbot.
//
// Extracted as its own pure function (no DB, no LLM) so the mapping
// logic is unit-testable without spinning up the full create-full
// workspace orchestrator. See create-full/route.ts for the caller.
//
// Key-shape note (do not "fix" without re-checking the source):
//   - R1LandingPayload.faq.items:      { id, question, answer }
//   - AgentBlueprint.faq:              { q, a, source?, ... }
//   - R1LandingPayload.services.services: { id, name, description }
//     (NO price field anywhere in the R1 generation pipeline — the
//     LLM prompt never asks for one and ExtractedBusinessFacts.
//     services_detailed only carries name/description). So pricing
//     facts can only be populated defensively, in case a future
//     payload version starts carrying an optional `price`/`amount`
//     field on a service entry; today's payloads will always map to
//     an empty pricingFacts array, and that's fine — a chatbot with
//     FAQ but no pricing still answers real questions instead of
//     nothing.

import type { R1LandingPayload } from "./r1-payload-prompt";
import { inferVertical } from "./r1-payload-prompt";

export type MappedChatbotFaqEntry = {
  q: string;
  a: string;
  source: "extracted";
};

export type MappedChatbotPricingFact = {
  label: string;
  amount: number;
  currency: string;
};

export type MappedChatbotContent = {
  faq: MappedChatbotFaqEntry[];
  pricingFacts: MappedChatbotPricingFact[];
  greeting: string;
};

const DEFAULT_GREETING = "Hi! How can I help you today?";

/**
 * Optional shape a service entry MAY carry if a future R1 payload
 * version starts including pricing. Not part of the current
 * R1Service type — read defensively via a narrow cast, never assumed.
 */
type ServiceWithOptionalPrice = {
  name: string;
  description?: string;
  price?: number | null;
  currency?: string | null;
};

/**
 * Map a generated R1 landing payload into the FAQ/pricing/greeting
 * shape createAgent() expects. Pure — no I/O, no throws on malformed
 * input (defensive reads throughout so a partial/odd payload degrades
 * to empty arrays rather than blowing up workspace creation).
 *
 * @param payload      The R1 landing payload generated for this workspace
 *                      (or null/undefined if the landing step was
 *                      skipped/failed — callers should keep today's
 *                      empty-draft scaffold in that case).
 * @param businessName Fallback business name for the greeting when the
 *                      payload's own footer.businessName is missing.
 */
export function mapLandingContentToChatbot(
  payload: R1LandingPayload | null | undefined,
  businessName?: string,
): MappedChatbotContent {
  if (!payload) {
    return { faq: [], pricingFacts: [], greeting: DEFAULT_GREETING };
  }

  const faq: MappedChatbotFaqEntry[] = Array.isArray(payload.faq?.items)
    ? payload.faq.items
        .filter(
          (item) =>
            item &&
            typeof item.question === "string" &&
            item.question.trim().length > 0 &&
            typeof item.answer === "string" &&
            item.answer.trim().length > 0,
        )
        .map((item) => ({
          q: item.question.trim(),
          a: item.answer.trim(),
          source: "extracted" as const,
        }))
    : [];

  const services = Array.isArray(payload.services?.services)
    ? payload.services.services
    : [];
  const pricingFacts: MappedChatbotPricingFact[] = services
    .map((service) => service as unknown as ServiceWithOptionalPrice)
    .filter(
      (service) =>
        service &&
        typeof service.name === "string" &&
        service.name.trim().length > 0 &&
        typeof service.price === "number" &&
        Number.isFinite(service.price) &&
        service.price > 0,
    )
    .map((service) => ({
      label: service.name.trim(),
      amount: service.price as number,
      currency: (service.currency && service.currency.trim()) || "USD",
    }));

  const resolvedBusinessName =
    payload.footer?.businessName?.trim() || businessName?.trim() || "us";

  const serviceNames = services
    .map((s) => (typeof s?.name === "string" ? s.name : ""))
    .filter((s) => s.length > 0);
  const vertical = inferVertical(serviceNames, "");
  const nicheClause =
    vertical && vertical !== "general service" ? ` ${vertical}` : "";

  const greeting = `Hi! Thanks for reaching out to ${resolvedBusinessName} — how can I help with your${nicheClause} needs today?`;

  return { faq, pricingFacts, greeting };
}
