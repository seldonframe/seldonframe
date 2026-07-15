// Tests the pure resolution logic the server actions delegate to (the
// actions themselves are thin auth wrappers — auth is exercised by the
// route-authz pattern, not unit tests).
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryDraftStore } from "../../../src/lib/agent-drafts/storage-memory";
import { resolveDraftForOperator } from "../../../src/lib/agent-drafts/resolve";

describe("resolveDraftForOperator", () => {
  test("approves a pending draft", async () => {
    const store = createMemoryDraftStore();
    const filed = await store.fileDraft({
      orgId: "org-1", agentId: "a", conversationId: "c", stepAction: "s",
      kind: "other", title: "t", content: { body: "b" }, tier: "red",
    });
    const out = await resolveDraftForOperator(store, {
      orgId: "org-1", draftId: (filed as { draftId: string }).draftId,
      status: "approved", userId: "u1",
    });
    assert.deepEqual(out, { ok: true });
  });

  test("second resolution reports conflict, not success", async () => {
    const store = createMemoryDraftStore();
    const filed = await store.fileDraft({
      orgId: "org-1", agentId: "a", conversationId: "c", stepAction: "s",
      kind: "other", title: "t", content: { body: "b" }, tier: "red",
    });
    const id = (filed as { draftId: string }).draftId;
    await resolveDraftForOperator(store, { orgId: "org-1", draftId: id, status: "approved", userId: "u1" });
    const out = await resolveDraftForOperator(store, { orgId: "org-1", draftId: id, status: "dismissed", userId: "u2" });
    assert.deepEqual(out, { ok: false, conflict: true });
  });
});
