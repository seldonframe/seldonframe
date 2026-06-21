// Pure, DB-free helpers for the map section. No API key: the keyless
// `?q=...&output=embed` form renders a Google Maps iframe without billing.
// Returns null on blank input so the component can render nothing.

export type FooterAddress = {
  line1?: string;
  city?: string;
  state?: string;
  zip?: string;
} | null | undefined;

/** Collapse a structured footer address into one line, skipping blanks. */
export function joinFooterAddress(addr: FooterAddress): string {
  if (!addr || typeof addr !== "object") return "";
  const head = [addr.line1, addr.city].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
  const tail = [addr.state, addr.zip].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  return [head, tail].filter(Boolean).join(", ");
}

/** Keyless Google Maps embed URL, or null when there's no usable address. */
export function mapEmbedUrl(address: string | null | undefined): string | null {
  const q = (address ?? "").trim();
  if (!q) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
}

/**
 * Best map query for a workspace footer:
 * 1. The full street address when present.
 * 2. The primary service-area city when there is no street address (so
 *    service-area businesses still get a "where we serve" map).
 * 3. Empty string when nothing usable exists (MapSection self-hides).
 *
 * Note: `state` is not a top-level footer field — it lives inside
 * `address` — so it is only available when a street address is present
 * (case 1). The service-area fallback (case 2) uses the city alone,
 * which geocodes accurately in Google Maps.
 */
export function resolveMapQuery(footer: {
  address?: FooterAddress;
  serviceAreas?: string[] | null;
}): string {
  const fromAddress = joinFooterAddress(footer.address);
  if (fromAddress) return fromAddress;
  const primaryArea = (footer.serviceAreas ?? [])[0];
  if (primaryArea && primaryArea.trim()) return primaryArea.trim();
  return "";
}
