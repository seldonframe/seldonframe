import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_TOOLS,
  DRAFT_FOR_APPROVAL_CAPABILITY,
  draftForApproval,
  getToolsForCapabilities,
} from "../../../src/lib/agents/tools";

const ctx = {
  orgId: "org-1", orgSlug: "acme", agentId: "agent-1",
  conversationId: "conv-1", testMode: true,
} as Parameters<typeof draftForApproval.execute>[1];

describe("draft_for_approval tool", () => {
  test("is NOT in ALL_TOOLS (opt-in only — empty capabilities must never see it)", () => {
    assert.equal(ALL_TOOLS.some((t) => t.name === "draft_for_approval"), false);
  });

  test("no-capabilities agents get the untouched ALL_TOOLS reference (regression invariant)", async () => {
    const tools = await getToolsForCapabilities(undefined);
    assert.equal(tools.length, ALL_TOOLS.length);
    tools.forEach((t, i) => assert.equal(t, ALL_TOOLS[i]));
  });

  test("capability opt-in appends the tool after natives", async () => {
    const tools = await getToolsForCapabilities([DRAFT_FOR_APPROVAL_CAPABILITY, "escalate_to_human"]);
    const names = tools.map((t) => t.name);
    assert.ok(names.includes("draft_for_approval"));
    assert.ok(names.includes("escalate_to_human"));
  });

  test("testMode short-circuits with a synthetic draft id and no DB import", async () => {
    const out = await draftForApproval.execute(
      { stepAction: "Send invoice", kind: "invoice", title: "Inv", body: "Invoice #1" },
      ctx,
    );
    assert.equal(out.ok, true);
    assert.match(out.draftId ?? "", /^test-draft-/);
  });

  test("zod schema rejects an empty body", () => {
    const parsed = draftForApproval.inputSchema.safeParse({
      stepAction: "Send invoice", kind: "invoice", title: "Inv", body: "",
    });
    assert.equal(parsed.success, false);
  });
});
