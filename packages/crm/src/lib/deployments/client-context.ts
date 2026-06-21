// Per-client context Phase 1 — map a compiled SoulV4 to the NARROW
// DeploymentClientContext the deploy flow persists and the voice path reads.
//
// This is a PLAIN module (NOT "use server"): it's imported by the server action
// (actions.ts) AND the unit tests, and it exports a synchronous pure function.
//
// The mapping is deliberately LOSSY — a compiled SoulV4 carries landing,
// pricing, intake, intelligence-hook, and routing data we do NOT want a deployed
// receptionist to speak. We keep ONLY the four things composeVoicePersona reads
// to let the agent speak AS the client:
//   business_name        → soul.businessName
//   soul_description      → soul.businessDescription
//   booking_config.services[] ({name,price,description}) → soul.services[] ({name,description?})  (price dropped)
//   faqs[] ({q,a,sourceUrl})                              → faq[] ({q,a})                          (sourceUrl dropped)
//
// Everything is trimmed; empty values are dropped so a blank capture collapses
// to `{}` (the voice path then falls back to clientName — today's behavior).

import type { SoulV4 } from "@/lib/soul-compiler/schema";
import type {
  DeploymentClientContext,
  DeploymentClientService,
  DeploymentClientSoul,
} from "@/db/schema/deployments";

/** Trim a value to a non-empty string, or return undefined. */
function cleanStr(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Map a (possibly partial) compiled SoulV4 → DeploymentClientContext, keeping
 * only the persona-relevant fields. Pure; reads defensively so a partial soul
 * never throws. Returns `{}` when nothing usable is present.
 */
export function mapSoulToClientContext(
  soul: SoulV4 | null | undefined,
): DeploymentClientContext {
  if (!soul || typeof soul !== "object") return {};

  // ── soul subset ──────────────────────────────────────────────────────────
  const businessName = cleanStr(soul.business_name);
  const businessDescription = cleanStr(soul.soul_description);

  // services from booking_config.services — drop price, trim, drop blank names.
  const services: DeploymentClientService[] = [];
  const rawServices = soul.booking_config?.services;
  if (Array.isArray(rawServices)) {
    for (const svc of rawServices) {
      const name = cleanStr(svc?.name);
      if (!name) continue; // a service with no name is useless to a receptionist.
      const description = cleanStr(svc?.description);
      services.push(description ? { name, description } : { name });
    }
  }

  const clientSoul: DeploymentClientSoul = {};
  if (businessName) clientSoul.businessName = businessName;
  if (businessDescription) clientSoul.businessDescription = businessDescription;
  if (services.length > 0) clientSoul.services = services;

  // ── faq ──────────────────────────────────────────────────────────────────
  const faq: { q: string; a: string }[] = [];
  if (Array.isArray(soul.faqs)) {
    for (const entry of soul.faqs) {
      const q = cleanStr(entry?.q);
      const a = cleanStr(entry?.a);
      if (q && a) faq.push({ q, a }); // sourceUrl intentionally dropped.
    }
  }

  // ── assemble — drop empty branches so a blank capture collapses to {} ──────
  const out: DeploymentClientContext = {};
  if (Object.keys(clientSoul).length > 0) out.soul = clientSoul;
  if (faq.length > 0) out.faq = faq;
  return out;
}
