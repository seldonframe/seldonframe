// Marketplace buyer surface — the shared brand theme tokens (pure; no React).
//
// The buyer's post-purchase journey (setup wizard + "My Agent" home) is a
// FOCUSED surface: the real SeldonFrame brand, none of the agency chrome. This
// module is the single source of truth for that surface's palette + type, so the
// shell, the wizard, and every ported step screen agree on the same tokens.
//
// It deliberately REUSES the marketplace storefront palette (MKT) so the buyer
// flow feels continuous with the marketplace they just bought from — same cream
// paper, same ink, same mono for numbers — and pins the accent to the REAL
// SeldonFrame brand teal-green `#1F2B24` (MKT.green), NOT the violet the Claude
// Design export used. Everything here is a plain string/const so it imports into
// both server components and client islands.
//
// Pure data (no DOM, no "use client") — importable anywhere.

import { MKT } from "@/components/marketplace/marketplace-data";

/** The buyer-surface accent — the SeldonFrame brand teal-green. Re-exported from
 *  the marketplace tokens so there is exactly ONE teal in the product. This is
 *  the `--accent` the shell sets and every step's primary action reads. */
export const BUYER_ACCENT = MKT.green; // "#1F2B24"

/** A darker press/hover shade of the accent (the Claude Design's `--accent-strong`). */
export const BUYER_ACCENT_STRONG = "#00736A";

/** A soft tint of the accent for highlight cards / connected states. */
export const BUYER_ACCENT_SOFT = "#E4F0ED";
export const BUYER_ACCENT_SOFT_2 = "#D2E8E3";
/** The readable "ink" shade of the accent for text on a soft-accent field. */
export const BUYER_ACCENT_INK = "#0A6056";

/**
 * The full buyer-surface token set. A flat object (not CSS-in-JS) so a component
 * can either spread the colours into inline `style` or hand them to the shell to
 * publish as CSS custom properties (`--accent`, `--paper`, …). Mirrors the
 * marketplace storefront values + the Claude Design's neutral ramp so the ported
 * screens are pixel-faithful while staying on-brand.
 */
export const BUYER = {
  // Surfaces — the cream-paper marketplace aesthetic.
  paper: MKT.paper, // "#F6F2EA"
  paper2: "#EEE8DB",
  card: "#FFFFFF",

  // Text ramp.
  ink: MKT.ink, // "#221D17"
  ink2: "#6B6155",
  ink3: "#9A8F80",

  // Hairlines.
  line: "rgba(34,29,23,0.09)",
  lineStrong: "rgba(34,29,23,0.16)",

  // Accent — the real SeldonFrame teal.
  accent: BUYER_ACCENT,
  accentStrong: BUYER_ACCENT_STRONG,
  accentContrast: "#FFFFFF",
  accentSoft: BUYER_ACCENT_SOFT,
  accentSoft2: BUYER_ACCENT_SOFT_2,
  accentInk: BUYER_ACCENT_INK,

  // Status tones (go-live "live now", drafted-from-site confirmations).
  positive: "#2E7D63",
  posSoft: "#E4F0EA",
  amber: "#B0742A",
  amberSoft: "#F4EADB",
  info: "#3A6EA5",
  infoSoft: "#E7EDF4",

  // Type — reuse the marketplace font stacks (Hanken sans, DM Mono for numbers).
  fontSans: MKT.fontSans,
  fontMono: MKT.fontMono,

  // Shape + depth.
  radius: "14px",
  radiusLg: "22px",
  shadowSoft: "0 1px 2px rgba(34,29,23,.05), 0 8px 24px -16px rgba(34,29,23,.20)",
  shadowCard: "0 1px 2px rgba(34,29,23,.05), 0 22px 48px -26px rgba(34,29,23,.28)",
  shadowAccent: "0 1px 2px rgba(31, 43, 36,.20), 0 14px 30px -14px rgba(31, 43, 36,.45)",
} as const;

/** The CSS custom properties the buyer shell publishes on its root so descendant
 *  step components can theme off `var(--accent)` / `var(--paper)` exactly like the
 *  Claude Design export did. Returns a `React.CSSProperties`-compatible object of
 *  `--*` keys (cast at the call site). */
export function buyerCssVars(): Record<string, string> {
  return {
    "--paper": BUYER.paper,
    "--paper-2": BUYER.paper2,
    "--card": BUYER.card,
    "--ink": BUYER.ink,
    "--ink-2": BUYER.ink2,
    "--ink-3": BUYER.ink3,
    "--line": BUYER.line,
    "--line-strong": BUYER.lineStrong,
    "--accent": BUYER.accent,
    "--accent-strong": BUYER.accentStrong,
    "--accent-contrast": BUYER.accentContrast,
    "--accent-soft": BUYER.accentSoft,
    "--accent-soft-2": BUYER.accentSoft2,
    "--accent-ink": BUYER.accentInk,
    "--positive": BUYER.positive,
    "--pos-soft": BUYER.posSoft,
    "--amber": BUYER.amber,
    "--amber-soft": BUYER.amberSoft,
    "--info": BUYER.info,
    "--info-soft": BUYER.infoSoft,
    "--radius-md": BUYER.radius,
  };
}
