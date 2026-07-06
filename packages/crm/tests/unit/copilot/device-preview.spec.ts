import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { computeDevicePreview, DEVICE_WIDTHS } from "../../../src/lib/copilot/device-preview";

describe("computeDevicePreview", () => {
  test("desktop: renders at 1280 and scales down to fit a narrow pane", () => {
    const box = computeDevicePreview(480, 524, "desktop");
    assert.equal(box.width, 1280);
    assert.equal(box.scale, 480 / 1280); // 0.375
    assert.equal(box.height, 524 / (480 / 1280)); // pre-scale height
  });

  test("mobile: renders at 390 and fills the pane width", () => {
    const box = computeDevicePreview(480, 524, "mobile");
    assert.equal(box.width, 390);
    assert.equal(box.scale, 480 / 390);
  });

  test("scaled height * scale === pane height (fills the pane vertically)", () => {
    const box = computeDevicePreview(480, 524, "desktop");
    assert.ok(Math.abs(box.height * box.scale - 524) < 1e-6);
  });

  test("guards paneWidth 0 (before ResizeObserver fires) → scale 1, no divide-by-zero", () => {
    const box = computeDevicePreview(0, 524, "desktop");
    assert.equal(box.scale, 1);
    assert.equal(box.height, 524);
  });

  test("DEVICE_WIDTHS are the expected desktop/mobile targets", () => {
    assert.equal(DEVICE_WIDTHS.desktop, 1280);
    assert.equal(DEVICE_WIDTHS.mobile, 390);
  });
});
