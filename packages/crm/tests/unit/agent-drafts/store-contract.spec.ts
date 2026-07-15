import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryDraftStore } from "../../../src/lib/agent-drafts/storage-memory";
import { MAX_DRAFTS_PER_CONVERSATION } from "../../../src/lib/agent-drafts/policy";
import type { FileDraftInput } from "../../../src/lib/agent-drafts/types";

const base: FileDraftInput = {
  orgId: "org-1", agentId: "agent-1", conversationId: "conv-1",
  stepAction: "Send the invoice", kind: "invoice", title: "Invoice for ACME",
  content: { body: "Invoice #12 — $450", fields: { amount: "$450" } }, tier: "red",
};

describe("agent-draft store contract", () => {
  test("files a draft and lists it pending", async () => {
    const store = createMemoryDraftStore();
    const r = await store.fileDraft(base);
    assert.equal(r.outcome, "filed");
    const rows = await store.listDrafts({ orgId: "org-1", status: "pending" });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.stepAction, "Send the invoice");
  });

  test("second filing for same (conversation, step) dedupes to the same id", async () => {
    const store = createMemoryDraftStore();
    const a = await store.fileDraft(base);
    const b = await store.fileDraft({ ...base, title: "different title, same step" });
    assert.equal(a.outcome, "filed");
    assert.equal(b.outcome, "deduped");
    assert.equal((b as { draftId: string }).draftId, (a as { draftId: string }).draftId);
    assert.equal((await store.listDrafts({ orgId: "org-1" })).length, 1);
  });

  test("refiling is allowed after the pending row resolves", async () => {
    const store = createMemoryDraftStore();
    const a = await store.fileDraft(base);
    await store.resolveDraft({ orgId: "org-1", draftId: (a as { draftId: string }).draftId, status: "approved", userId: "u1" });
    const b = await store.fileDraft(base);
    assert.equal(b.outcome, "filed");
    assert.equal((await store.listDrafts({ orgId: "org-1" })).length, 2);
  });

  test("resolve is CAS: second resolution returns null, row keeps first outcome", async () => {
    const store = createMemoryDraftStore();
    const a = await store.fileDraft(base);
    const id = (a as { draftId: string }).draftId;
    const first = await store.resolveDraft({ orgId: "org-1", draftId: id, status: "approved", userId: "u1" });
    const second = await store.resolveDraft({ orgId: "org-1", draftId: id, status: "dismissed", userId: "u2" });
    assert.ok(first);
    assert.equal(first!.status, "approved");
    assert.equal(second, null);
    const rows = await store.listDrafts({ orgId: "org-1", status: "approved" });
    assert.equal(rows.length, 1);
  });

  test("resolve is org-scoped: wrong org returns null and mutates nothing", async () => {
    const store = createMemoryDraftStore();
    const a = await store.fileDraft(base);
    const r = await store.resolveDraft({ orgId: "org-EVIL", draftId: (a as { draftId: string }).draftId, status: "approved", userId: "u1" });
    assert.equal(r, null);
    assert.equal((await store.listDrafts({ orgId: "org-1", status: "pending" })).length, 1);
  });

  test("cap: filing MAX+1 distinct steps in one conversation returns capped (cap counts all statuses)", async () => {
    const store = createMemoryDraftStore();
    for (let i = 0; i < MAX_DRAFTS_PER_CONVERSATION; i++) {
      const r = await store.fileDraft({ ...base, stepAction: `step ${i}` });
      assert.equal(r.outcome, "filed");
    }
    // resolve one — cap still counts it (all statuses)
    const rows = await store.listDrafts({ orgId: "org-1", status: "pending" });
    await store.resolveDraft({ orgId: "org-1", draftId: rows[0]!.id, status: "dismissed", userId: "u1" });
    const over = await store.fileDraft({ ...base, stepAction: "one more" });
    assert.equal(over.outcome, "capped");
  });

  test("listDrafts never crosses orgs", async () => {
    const store = createMemoryDraftStore();
    await store.fileDraft(base);
    await store.fileDraft({ ...base, orgId: "org-2", conversationId: "conv-9" });
    assert.equal((await store.listDrafts({ orgId: "org-1" })).length, 1);
    assert.equal((await store.listDrafts({ orgId: "org-2" })).length, 1);
  });

  test("countPending counts only pending for the org", async () => {
    const store = createMemoryDraftStore();
    const a = await store.fileDraft(base);
    await store.fileDraft({ ...base, stepAction: "second step" });
    await store.resolveDraft({ orgId: "org-1", draftId: (a as { draftId: string }).draftId, status: "approved", userId: "u1" });
    assert.equal(await store.countPending("org-1"), 1);
  });
});
