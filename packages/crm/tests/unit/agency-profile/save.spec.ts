// packages/crm/tests/unit/agency-profile/save.spec.ts
//
// Tests the saveAgencyProfile orchestrator. Follows the same DI pattern
// as runListMineWorkspaces (Cut B) because tsx's CJS interop puts named
// exports behind a `default` namespace, making `mock.method(module,
// "name", ...)` unreliable.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  runSaveAgencyProfile,
  type RunSaveAgencyProfileDeps,
} from "../../../src/lib/agency-profile/run-save";

type Updates = Array<{ id: string; profile: Record<string, unknown> }>;

function baseDeps(updates: Updates): RunSaveAgencyProfileDeps {
  return {
    updateUserAgencyProfile: async (input) => {
      updates.push({ id: input.userId, profile: input.profile });
    },
  };
}

describe("runSaveAgencyProfile — validation", () => {
  test("rejects empty agency name", async () => {
    const updates: Updates = [];
    const formData = new FormData();
    formData.set("name", "");
    formData.set("brandColor", "#7c3aed");
    formData.set("websiteUrl", "");

    const result = await runSaveAgencyProfile({
      formData,
      sessionUser: { id: "user-1" },
      deps: baseDeps(updates),
    });

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /name/i);
    assert.equal(updates.length, 0);
  });

  test("rejects invalid hex color", async () => {
    const updates: Updates = [];
    const formData = new FormData();
    formData.set("name", "Acme Digital");
    formData.set("brandColor", "purple");
    formData.set("websiteUrl", "");

    const result = await runSaveAgencyProfile({
      formData,
      sessionUser: { id: "user-1" },
      deps: baseDeps(updates),
    });

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /color/i);
    assert.equal(updates.length, 0);
  });

  test("rejects malformed website URL", async () => {
    const updates: Updates = [];
    const formData = new FormData();
    formData.set("name", "Acme Digital");
    formData.set("brandColor", "#7c3aed");
    formData.set("websiteUrl", "not-a-url");

    const result = await runSaveAgencyProfile({
      formData,
      sessionUser: { id: "user-1" },
      deps: baseDeps(updates),
    });

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /url/i);
    assert.equal(updates.length, 0);
  });

  test("accepts empty website URL (optional field)", async () => {
    const updates: Updates = [];
    const formData = new FormData();
    formData.set("name", "Acme Digital");
    formData.set("brandColor", "#7c3aed");
    formData.set("websiteUrl", "");
    formData.set("logoUrl", "");

    const result = await runSaveAgencyProfile({
      formData,
      sessionUser: { id: "user-1" },
      deps: baseDeps(updates),
    });

    assert.equal(result.ok, true);
    assert.equal(updates.length, 1);
    assert.equal(updates[0]!.profile.name, "Acme Digital");
    assert.equal(updates[0]!.profile.brand_color, "#7c3aed");
    assert.equal(updates[0]!.profile.website_url, undefined);
    assert.equal(updates[0]!.profile.logo_url, undefined);
  });

  test("returns 401 when no session", async () => {
    const updates: Updates = [];
    const formData = new FormData();
    formData.set("name", "Acme");
    formData.set("brandColor", "#7c3aed");

    const result = await runSaveAgencyProfile({
      formData,
      sessionUser: null,
      deps: baseDeps(updates),
    });

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /unauthorized/i);
    assert.equal(updates.length, 0);
  });

  test("trims whitespace and persists logo_url and website_url when provided", async () => {
    const updates: Updates = [];
    const formData = new FormData();
    formData.set("name", "  Acme Digital  ");
    formData.set("brandColor", "#7c3aed");
    formData.set("websiteUrl", "https://acmedigital.com");
    formData.set("logoUrl", "https://cdn.example.com/users/u/logo.png");

    const result = await runSaveAgencyProfile({
      formData,
      sessionUser: { id: "user-1" },
      deps: baseDeps(updates),
    });

    assert.equal(result.ok, true);
    assert.equal(updates[0]!.profile.name, "Acme Digital");
    assert.equal(updates[0]!.profile.website_url, "https://acmedigital.com");
    assert.equal(updates[0]!.profile.logo_url, "https://cdn.example.com/users/u/logo.png");
  });

  test("accepts 3-char hex color (e.g. #f0a)", async () => {
    const updates: Updates = [];
    const formData = new FormData();
    formData.set("name", "Acme");
    formData.set("brandColor", "#f0a");

    const result = await runSaveAgencyProfile({
      formData,
      sessionUser: { id: "user-1" },
      deps: baseDeps(updates),
    });

    assert.equal(result.ok, true);
    assert.equal(updates[0]!.profile.brand_color, "#f0a");
  });
});
