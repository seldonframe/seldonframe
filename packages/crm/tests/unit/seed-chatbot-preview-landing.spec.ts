// Tests for v1.55.0 seedChatbotPreviewLanding.
//
// Writes a single chatbotPreview section to landing_pages.sections,
// replacing any existing sections (the chatbotPreview IS the default
// public surface for new workspaces). Tagline falls back to a generic
// when soul.business_description is null. Embed URL format matches
// the existing chatbot embed pattern.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildChatbotPreviewSection,
  type SeedChatbotPreviewInput,
} from "../../src/lib/workspace/seed-chatbot-preview-landing";

describe("buildChatbotPreviewSection — pure shape construction", () => {
  test("uses business_description as tagline when present", () => {
    const input: SeedChatbotPreviewInput = {
      orgId: "org-1",
      businessName: "Ignitify Cooling",
      tagline: "BBB-accredited HVAC team serving El Paso",
      orgSlug: "ignitify-cooling",
      agentSlug: "default",
      workspaceBaseDomain: "app.seldonframe.com",
    };
    const section = buildChatbotPreviewSection(input);
    assert.equal(section.type, "chatbotPreview");
    assert.equal(section.order, 1);
    assert.equal((section.content as { businessName: string }).businessName, "Ignitify Cooling");
    assert.equal((section.content as { tagline: string }).tagline, "BBB-accredited HVAC team serving El Paso");
  });

  test("falls back to generic tagline when tagline is null", () => {
    const input: SeedChatbotPreviewInput = {
      orgId: "org-2",
      businessName: "Acme Plumbing",
      tagline: null,
      orgSlug: "acme-plumbing",
      agentSlug: "default",
      workspaceBaseDomain: "app.seldonframe.com",
    };
    const section = buildChatbotPreviewSection(input);
    assert.equal(
      (section.content as { tagline: string }).tagline,
      "AI receptionist — ask Acme Plumbing anything",
    );
  });

  test("constructs embed URL with org-slug--agent-slug pattern", () => {
    const input: SeedChatbotPreviewInput = {
      orgId: "org-3",
      businessName: "Acme",
      tagline: null,
      orgSlug: "acme",
      agentSlug: "default",
      workspaceBaseDomain: "app.seldonframe.com",
    };
    const section = buildChatbotPreviewSection(input);
    assert.equal(
      (section.content as { embedUrl: string }).embedUrl,
      "https://app.seldonframe.com/api/v1/public/agent/acme--default/embed.js",
    );
  });

  test("truncates very long taglines to 200 chars (defensive)", () => {
    const longTagline = "A".repeat(500);
    const input: SeedChatbotPreviewInput = {
      orgId: "org-6",
      businessName: "Acme",
      tagline: longTagline,
      orgSlug: "acme",
      agentSlug: "default",
      workspaceBaseDomain: "app.seldonframe.com",
    };
    const section = buildChatbotPreviewSection(input);
    assert.ok((section.content as { tagline: string }).tagline.length <= 200);
  });

  // v1.55.x — agentId plumbed through to the seeded section so the
  // wizard can deep-link to /agents/<id>/{test,evals,settings}.
  test("includes agentId in section.content when provided", () => {
    const input: SeedChatbotPreviewInput = {
      orgId: "org-7",
      businessName: "Acme",
      tagline: null,
      orgSlug: "acme",
      agentSlug: "default",
      workspaceBaseDomain: "app.seldonframe.com",
      agentId: "ag_xyz789",
    };
    const section = buildChatbotPreviewSection(input);
    assert.equal(
      (section.content as { agentId?: string }).agentId,
      "ag_xyz789",
      "agentId should be carried through to section.content",
    );
  });

  test("omits agentId from section.content when not provided (legacy workspaces)", () => {
    const input: SeedChatbotPreviewInput = {
      orgId: "org-8",
      businessName: "Acme",
      tagline: null,
      orgSlug: "acme",
      agentSlug: "default",
      workspaceBaseDomain: "app.seldonframe.com",
    };
    const section = buildChatbotPreviewSection(input);
    assert.ok(
      !("agentId" in (section.content as Record<string, unknown>)),
      "agentId should not be set when input doesn't provide it",
    );
  });
});
