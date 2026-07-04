// 2026-07-04 — Task 9 of the win-ladder + SeldonChat plan. Step-3 share
// assets: a copy-ready link plus a QR code image, both derived from the
// workspace's public site URL. Deterministic (qrcode encoding has no
// randomness) so this is unit-testable without a DB or network call — see
// tests/unit/activation/share.spec.ts.
//
// The "mark share used" server action lives in share-actions.ts, not here,
// so this file can stay a plain (non-"use server") module importable from
// both server and client contexts without tripping check-use-server.sh's
// "use server" files may only export async functions rule.

import QRCode from "qrcode";

export type ShareAssets = {
  siteUrl: string;
  qrDataUrl: string;
};

/**
 * Build the step-3 "go live" share assets for a workspace's public site
 * URL: the URL itself (echoed back for convenience) and a QR code encoding
 * it, rendered as a `data:image/png` data URL sized for the share-row UI.
 */
export async function buildShareAssets(input: { siteUrl: string }): Promise<ShareAssets> {
  const qrDataUrl = await QRCode.toDataURL(input.siteUrl, { margin: 1, width: 240 });
  return {
    siteUrl: input.siteUrl,
    qrDataUrl,
  };
}
