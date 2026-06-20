// packages/crm/src/lib/landing/service-pages-prompt.ts
//
// Builds the LLM prompt that generates one ServicePage per REAL service.
// The function is pure (string → string) — no DB access, no network calls.
// The LLM output (JSON) is post-processed by Task 5's generateServicePages.

/** @see ServicePage in ./r1-site-tree for the full shape */
export type ServicePagesPromptInput = {
  services: { id: string; name: string; description: string }[];
  businessName: string;
  vertical: string;
  city: string;
  testimonials: { quote: string; name?: string; city?: string; rating?: number; service?: string }[];
};

export function buildServicePagesPrompt(input: ServicePagesPromptInput): string {
  const list = input.services.map((s, i) => `${i + 1}. ${s.name} — ${s.description}`).join("\n");
  return [
    `You write per-service detail pages for ${input.businessName}, a ${input.vertical} business in ${input.city}.`,
    `Write EXACTLY ONE service page for each of these ${input.services.length} services, in this order. Do NOT add, remove, merge, or rename services — use ONLY the services listed:`,
    list,
    ``,
    `For each service return an object:`,
    `{ "name": <exact service name>, "summary": <1 sentence>, "body": [ { "kind": "heading", "text": <short heading> }, { "kind": "paragraph", "text": <2-4 sentences> }, ... 2-4 blocks ], "ctaLabel": <e.g. "Get a free <service> estimate"> }`,
    `Voice: confident, specific, on-brand for ${input.vertical}. Never invent prices, guarantees, or services not listed. Use the city/region naturally.`,
    input.testimonials.length
      ? `You may reference these real testimonials thematically but do NOT fabricate new ones.`
      : ``,
    `Return JSON: { "servicePages": [ ...one per service, same order... ] }. JSON only.`,
  ].filter(Boolean).join("\n");
}
