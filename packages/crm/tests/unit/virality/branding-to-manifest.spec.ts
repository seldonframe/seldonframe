// Pins the per-agency PWA manifest mapping. The dynamic
// /portal/[orgSlug]/manifest.webmanifest route is a thin shell over
// brandingToManifestOptions(...) + generatePwaManifest(...); these
// tests are the real coverage for "agency name/theme drives the
// installed app identity, SF defaults otherwise".

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  brandingToManifestOptions,
  generatePwaManifest,
} from "@seldonframe/core/virality";

const SF_BRANDING = {
  is_white_label: false,
  brand_name: "SeldonFrame",
  logo_url: null,
  primary_color: null,
  accent_color: null,
};

const AGENCY_BRANDING = {
  is_white_label: true,
  brand_name: "Seldon Studio",
  logo_url: "https://cdn.example.com/logo.png",
  primary_color: "#5b21b6",
  accent_color: "#a78bfa",
};

describe("brandingToManifestOptions", () => {
  test("scopes start_url + scope to the org's portal path", () => {
    const opts = brandingToManifestOptions({ orgSlug: "rapid-rooter", branding: AGENCY_BRANDING });
    assert.equal(opts.startUrl, "/portal/rapid-rooter/");
    assert.equal(opts.scope, "/portal/rapid-rooter/");
  });

  test("uses the agency brand name for name + short_name", () => {
    const opts = brandingToManifestOptions({ orgSlug: "rapid-rooter", branding: AGENCY_BRANDING });
    assert.equal(opts.name, "Seldon Studio");
    assert.equal(opts.shortName, "Seldon Studio");
  });

  test("uses the agency primary color for theme_color", () => {
    const opts = brandingToManifestOptions({ orgSlug: "rapid-rooter", branding: AGENCY_BRANDING });
    assert.equal(opts.themeColor, "#5b21b6");
  });

  test("falls back to SeldonFrame name + default theme when not white-label", () => {
    const opts = brandingToManifestOptions({ orgSlug: "demo", branding: SF_BRANDING });
    assert.equal(opts.name, "SeldonFrame");
    assert.equal(opts.themeColor, "#0a0e14");
  });

  test("always references the default PNG icon set", () => {
    const opts = brandingToManifestOptions({ orgSlug: "demo", branding: SF_BRANDING });
    const srcs = (opts.icons ?? []).map((i) => i.src);
    assert.ok(srcs.includes("/icon-192.png"));
    assert.ok(srcs.includes("/icon-512.png"));
  });

  test("produces a maskable 512 icon entry", () => {
    const opts = brandingToManifestOptions({ orgSlug: "demo", branding: SF_BRANDING });
    const maskable = (opts.icons ?? []).find((i) => i.purpose === "maskable");
    assert.ok(maskable, "expected a maskable icon entry");
    assert.equal(maskable?.sizes, "512x512");
  });

  test("generatePwaManifest threads scope + standalone display through", () => {
    const manifest = generatePwaManifest(
      brandingToManifestOptions({ orgSlug: "rapid-rooter", branding: AGENCY_BRANDING }),
    );
    assert.equal(manifest.scope, "/portal/rapid-rooter/");
    assert.equal(manifest.start_url, "/portal/rapid-rooter/");
    assert.equal(manifest.display, "standalone");
  });
});
