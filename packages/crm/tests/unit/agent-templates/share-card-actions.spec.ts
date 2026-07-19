// Agent setup mode slice (T5) — share_cards mint/preview/publish/unpublish.
// DI'd (ShareCardActionDeps) so the org-guard + scrub-on-publish logic is
// directly unit-testable without a live DB/session.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  previewShareCardAction,
  publishShareCardAction,
  unpublishShareCardAction,
  getShareCardStatusAction,
  type ShareCardActionDeps,
  type OwnedTemplate,
} from "../../../src/lib/agent-templates/share-card-actions";
import type { ShareCardStep } from "../../../src/db/schema/share-cards";

const ORG_ID = "org-1";
const TEMPLATE_ID = "tmpl-1";
const TEMPLATE: OwnedTemplate = { id: TEMPLATE_ID, name: "Lead Responder" };

function baseDeps(over: Partial<ShareCardActionDeps> = {}): ShareCardActionDeps {
  return {
    getOrgId: async () => ORG_ID,
    loadOwnedTemplate: async () => TEMPLATE,
    loadTemplateSteps: async () => ["Check the inbox", "Send the reply"],
    mintSlug: () => "aaaaaaaaaaaaaaaaaaaaaaaa", // 24 chars, test-fixed
    replaceShareCard: async () => {},
    deleteShareCard: async () => {},
    loadShareCardSlug: async () => null,
    ...over,
  };
}

describe("previewShareCardAction", () => {
  test("unauthorized when there is no logged-in org", async () => {
    const result = await previewShareCardAction(TEMPLATE_ID, baseDeps({ getOrgId: async () => null }));
    assert.deepEqual(result, { ok: false, error: "unauthorized" });
  });

  test("a template owned by another org -> template_not_found", async () => {
    const result = await previewShareCardAction(
      TEMPLATE_ID,
      baseDeps({ loadOwnedTemplate: async () => null }),
    );
    assert.deepEqual(result, { ok: false, error: "template_not_found" });
  });

  test("recording steps become scrubbed preview labels", async () => {
    const result = await previewShareCardAction(
      TEMPLATE_ID,
      baseDeps({ loadTemplateSteps: async () => ["Email jane@acme.com the quote", "Log it"] }),
    );
    assert.deepEqual(result, {
      ok: true,
      agentName: "Lead Responder",
      steps: [{ label: "Email [email] the quote" }, { label: "Log it" }],
    });
  });

  test("no recorded steps -> a single generic fallback step", async () => {
    const result = await previewShareCardAction(TEMPLATE_ID, baseDeps({ loadTemplateSteps: async () => [] }));
    assert.deepEqual(result, { ok: true, agentName: "Lead Responder", steps: [{ label: "Lead Responder runs" }] });
  });
});

describe("publishShareCardAction", () => {
  test("unauthorized when there is no logged-in org", async () => {
    let wrote = false;
    const result = await publishShareCardAction(
      TEMPLATE_ID,
      [{ label: "Check the inbox" }],
      baseDeps({ getOrgId: async () => null, replaceShareCard: async () => { wrote = true; } }),
    );
    assert.deepEqual(result, { ok: false, error: "unauthorized" });
    assert.equal(wrote, false);
  });

  test("a template owned by another org -> template_not_found, nothing written", async () => {
    let wrote = false;
    const result = await publishShareCardAction(
      TEMPLATE_ID,
      [{ label: "Check the inbox" }],
      baseDeps({ loadOwnedTemplate: async () => null, replaceShareCard: async () => { wrote = true; } }),
    );
    assert.deepEqual(result, { ok: false, error: "template_not_found" });
    assert.equal(wrote, false);
  });

  test("steps that scrub to nothing -> no_steps, nothing written", async () => {
    let wrote = false;
    const result = await publishShareCardAction(
      TEMPLATE_ID,
      [{ label: "   " }, { label: "" }],
      baseDeps({ replaceShareCard: async () => { wrote = true; } }),
    );
    assert.deepEqual(result, { ok: false, error: "no_steps" });
    assert.equal(wrote, false);
  });

  test("happy path: re-scrubs the operator-edited labels defensively before writing", async () => {
    let written: { orgId: string; templateId: string; slug: string; steps: ShareCardStep[] } | null = null;
    const result = await publishShareCardAction(
      TEMPLATE_ID,
      [{ label: "Call 555-123-4567 about the quote" }],
      baseDeps({
        replaceShareCard: async (args) => {
          written = args;
        },
      }),
    );
    assert.deepEqual(result, {
      ok: true,
      slug: "aaaaaaaaaaaaaaaaaaaaaaaa",
      url: "https://app.seldonframe.com/a/aaaaaaaaaaaaaaaaaaaaaaaa",
    });
    assert.deepEqual(written, {
      orgId: ORG_ID,
      templateId: TEMPLATE_ID,
      slug: "aaaaaaaaaaaaaaaaaaaaaaaa",
      steps: [{ label: "Call [phone] about the quote" }],
    });
  });
});

describe("unpublishShareCardAction", () => {
  test("unauthorized when there is no logged-in org", async () => {
    let deleted = false;
    const result = await unpublishShareCardAction(
      TEMPLATE_ID,
      baseDeps({ getOrgId: async () => null, deleteShareCard: async () => { deleted = true; } }),
    );
    assert.deepEqual(result, { ok: false, error: "unauthorized" });
    assert.equal(deleted, false);
  });

  test("happy path deletes the row", async () => {
    let deletedArgs: { orgId: string; templateId: string } | null = null;
    const result = await unpublishShareCardAction(
      TEMPLATE_ID,
      baseDeps({ deleteShareCard: async (args) => { deletedArgs = args; } }),
    );
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(deletedArgs, { orgId: ORG_ID, templateId: TEMPLATE_ID });
  });
});

describe("getShareCardStatusAction", () => {
  test("no org -> unpublished, never queries the DB", async () => {
    const result = await getShareCardStatusAction(TEMPLATE_ID, baseDeps({ getOrgId: async () => null }));
    assert.deepEqual(result, { ok: true, published: false, slug: null, url: null });
  });

  test("no row -> unpublished", async () => {
    const result = await getShareCardStatusAction(TEMPLATE_ID, baseDeps({ loadShareCardSlug: async () => null }));
    assert.deepEqual(result, { ok: true, published: false, slug: null, url: null });
  });

  test("a row exists -> published with its url", async () => {
    const result = await getShareCardStatusAction(
      TEMPLATE_ID,
      baseDeps({ loadShareCardSlug: async () => "bbbbbbbbbbbbbbbbbbbbbbbb" }),
    );
    assert.deepEqual(result, {
      ok: true,
      published: true,
      slug: "bbbbbbbbbbbbbbbbbbbbbbbb",
      url: "https://app.seldonframe.com/a/bbbbbbbbbbbbbbbbbbbbbbbb",
    });
  });
});
