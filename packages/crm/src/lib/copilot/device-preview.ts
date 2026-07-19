// Pure helpers for the SeldonChat preview device toggle.
//
// The in-panel preview iframe is only ~480px wide, so it renders the live site
// in its narrow responsive layout — which differs from what a desktop visitor
// sees. A true "device preview" instead renders the site at a fixed target
// viewport width (desktop / mobile) and scales it to fit the pane, so the
// operator sees the WHOLE desktop (or mobile) layout at a glance, no horizontal
// scroll. This module holds the pure scale math; the component owns the
// ResizeObserver + the transform.

export type DeviceMode = "desktop" | "mobile";

/** Target viewport widths (px) the preview renders the site at: a common
 *  laptop width and a common phone width. */
export const DEVICE_WIDTHS: Record<DeviceMode, number> = {
  desktop: 1280,
  mobile: 390,
};

export type DevicePreviewBox = { width: number; height: number; scale: number };

/**
 * Given the preview pane's pixel size and the chosen device, return the iframe
 * render width/height + the CSS transform scale so the site renders at
 * DEVICE_WIDTHS[mode] and visually fills the pane (transform-origin: top left).
 * scale = paneWidth / target; height = paneHeight / scale so the scaled result
 * is exactly paneHeight. Pure + guarded: paneWidth 0 (before the ResizeObserver
 * fires) → scale 1, never a divide-by-zero.
 */
export function computeDevicePreview(
  paneWidth: number,
  paneHeight: number,
  mode: DeviceMode,
): DevicePreviewBox {
  const target = DEVICE_WIDTHS[mode];
  const scale = paneWidth > 0 ? paneWidth / target : 1;
  const height = scale > 0 ? paneHeight / scale : paneHeight;
  return { width: target, height, scale };
}
