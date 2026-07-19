// findSessionByTemplateId — the lookup the "Born from your recording"
// provenance panel (studio/agents/[id]/page.tsx) uses to find the
// recording_sessions row that produced a compiled template, if any.
// Same db-stub seam as tests/unit/url-extraction-cache-store.spec.ts:
// a minimal structural fake, never a real Postgres connection.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { findSessionByTemplateId } from "@/lib/recordings/session-store";

function mockDb(rows: unknown[]) {
  const calls: { where: unknown[] } = { where: [] };
  const db = {
    select: () => ({
      from: () => ({
        where: (cond: unknown) => {
          calls.where.push(cond);
          return { limit: async () => rows };
        },
      }),
    }),
  };
  return { db: db as never, calls };
}

describe("findSessionByTemplateId", () => {
  test("returns the matching session row", async () => {
    const row = { id: "session-1", agentTemplateId: "template-1" };
    const { db } = mockDb([row]);
    const result = await findSessionByTemplateId(db, "template-1");
    assert.deepEqual(result, row);
  });

  test("returns null when no session matches (the ordinary-template case)", async () => {
    const { db } = mockDb([]);
    const result = await findSessionByTemplateId(db, "template-1");
    assert.equal(result, null);
  });
});
