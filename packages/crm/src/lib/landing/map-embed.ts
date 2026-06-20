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
