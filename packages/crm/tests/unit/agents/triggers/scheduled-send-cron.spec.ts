// 2026-06-26 — Outbound-UX Bundle F2 (send delay): tests for the cron TICK that
// drains the event-agent scheduled-send queue (lib/agents/triggers/
// scheduled-send-cron.ts).
//
// The tick is PURE + DI'd, so these pin the loop logic with an IN-MEMORY store +
// fake runner — no Postgres, no Twilio/Resend. The in-memory store mirrors the
// DB store's contract: `listDue` returns only status='pending' rows whose dueAt
// <= now (oldest-first, capped), and `mark` CAS-transitions a row OUT of
// 'pending' at most once (bumping attempts on 'failed'). These pin:
//   • a due 'pending' row → runDue replayed (with the row's per-org deps) +
//     marked 'sent';
//   • a not-yet-due row → never loaded, never replayed (still 'pending');
//   • a throwing replay → marked 'failed', attempts++, and the loop CONTINUES to
//     the next row (error isolation);
//   • the replay is handed the deps from buildDeps(row.orgId) (so a still-delayed
//     agent can't re-defer — the replay strips the enqueue seam);
//   • the cap is honored;
//   • the tick never throws even if a mark fails.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  tickEventAgentScheduledSends,
  type ScheduledSendTickDeps,
} from "../../../../src/lib/agents/triggers/scheduled-send-cron";
import type { EventAgentScheduledSend } from "../../../../src/db/schema/event-agent-scheduled-sends";
import type { ScheduledEventAgentSendStore } from "../../../../src/lib/agents/triggers/scheduled-send-store";
import type { RunEventAgentDeps } from "../../../../src/lib/agents/triggers/run-event-agent";
import type { ScheduledEventAgentSend } from "../../../../src/lib/agents/triggers/scheduled-event-agent";

const NOW = new Date("2026-06-26T12:00:00.000Z");

/** Build a queue row with sensible defaults; override per test. */
function row(over: Partial<EventAgentScheduledSend> = {}): EventAgentScheduledSend {
  return {
    id: over.id ?? "row-1",
    orgId: over.orgId ?? "org-1",
    eventType: over.eventType ?? "booking.completed",
    contactId: over.contactId ?? "contact-1",
    payload: over.payload ?? { appointmentId: "appt-1", contactId: "contact-1" },
    agentSkill: over.agentSkill ?? "review-requester",
    channel: over.channel ?? "sms",
    // due an hour ago by default (i.e. ready to fire)
    dueAt: over.dueAt ?? new Date(NOW.getTime() - 60 * 60_000),
    status: over.status ?? "pending",
    attempts: over.attempts ?? 0,
    createdAt: over.createdAt ?? new Date(NOW.getTime() - 2 * 60 * 60_000),
    processedAt: over.processedAt ?? null,
    lastError: over.lastError ?? null,
  };
}

type MarkCall = { id: string; status: string; error?: string | null };

/**
 * An in-memory store that mirrors the DB store's contract:
 *   • listDue → status='pending' AND dueAt <= now, oldest-first, capped;
 *   • mark → CAS on status='pending' (transition at most once), bump attempts on
 *     'failed', stamp processedAt + lastError.
 */
function makeFakeStore(seed: EventAgentScheduledSend[]): {
  store: ScheduledEventAgentSendStore;
  rows: Map<string, EventAgentScheduledSend>;
  markCalls: MarkCall[];
} {
  const rows = new Map<string, EventAgentScheduledSend>(seed.map((r) => [r.id, { ...r }]));
  const markCalls: MarkCall[] = [];
  const store: ScheduledEventAgentSendStore = {
    listDue: async (now, limit) => {
      return [...rows.values()]
        .filter((r) => r.status === "pending" && r.dueAt.getTime() <= now.getTime())
        .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
        .slice(0, limit);
    },
    mark: async (id, update) => {
      markCalls.push({ id, status: update.status, error: update.error });
      const r = rows.get(id);
      // CAS: only a still-'pending' row transitions (can't double-fire).
      if (!r || r.status !== "pending") return;
      r.status = update.status;
      r.processedAt = new Date();
      r.lastError = update.error ?? null;
      if (update.status === "failed") r.attempts += 1;
    },
  };
  return { store, rows, markCalls };
}

/** A deps object is opaque to the tick; a tagged sentinel lets us assert the
 *  replay received the deps built for the row's org. */
function tagDeps(orgId: string): RunEventAgentDeps {
  return { __org: orgId } as unknown as RunEventAgentDeps;
}

describe("tickEventAgentScheduledSends — drains the due queue", () => {
  test("a due pending row → runDue replayed with the row's org deps + marked 'sent'", async () => {
    const { store, rows, markCalls } = makeFakeStore([row({ id: "r1", orgId: "org-7" })]);
    const replays: { send: ScheduledEventAgentSend; deps: RunEventAgentDeps }[] = [];
    const builtFor: string[] = [];

    const deps: ScheduledSendTickDeps = {
      store,
      now: () => NOW,
      buildDeps: (orgId) => {
        builtFor.push(orgId);
        return tagDeps(orgId);
      },
      runDue: async (send, d) => {
        replays.push({ send, deps: d });
        return { matched: 1, sent: 1 };
      },
    };

    const result = await tickEventAgentScheduledSends(deps);

    // The replay ran exactly once, with the reconstructed frozen send.
    assert.equal(replays.length, 1, "the due row was replayed once");
    assert.equal(replays[0].send.eventType, "booking.completed");
    assert.equal(replays[0].send.orgId, "org-7");
    assert.equal(replays[0].send.contactId, "contact-1");
    assert.equal(replays[0].send.agentSkill, "review-requester");
    assert.equal(replays[0].send.channel, "sms");
    // Deps were built for the row's org and handed to the replay (so the replay's
    // own seam-stripping prevents re-defer).
    assert.deepEqual(builtFor, ["org-7"]);
    assert.equal((replays[0].deps as unknown as { __org: string }).__org, "org-7");

    // Marked 'sent' AFTER the replay; row is terminal.
    assert.deepEqual(markCalls, [{ id: "r1", status: "sent", error: undefined }]);
    assert.equal(rows.get("r1")?.status, "sent");
    assert.equal(rows.get("r1")?.attempts, 0, "a clean send does not bump attempts");

    assert.deepEqual(result, { claimed: 1, sent: 1, failed: 0 });
  });

  test("a not-yet-due row is never loaded, never replayed (stays pending)", async () => {
    const future = new Date(NOW.getTime() + 30 * 60_000); // due in 30 min
    const { store, rows, markCalls } = makeFakeStore([row({ id: "later", dueAt: future })]);
    let replayed = 0;
    const result = await tickEventAgentScheduledSends({
      store,
      now: () => NOW,
      buildDeps: (o) => tagDeps(o),
      runDue: async () => {
        replayed += 1;
        return {};
      },
    });
    assert.equal(replayed, 0, "a future-due row must not replay");
    assert.equal(markCalls.length, 0, "and must not be marked");
    assert.equal(rows.get("later")?.status, "pending", "it stays pending for a later tick");
    assert.deepEqual(result, { claimed: 0, sent: 0, failed: 0 });
  });

  test("a throwing replay → marked 'failed' (attempts++), and the loop CONTINUES", async () => {
    const { store, rows, markCalls } = makeFakeStore([
      row({ id: "boom", agentSkill: "review-requester", dueAt: new Date(NOW.getTime() - 120 * 60_000) }),
      row({ id: "ok", agentSkill: "speed-to-lead", eventType: "lead.created", dueAt: new Date(NOW.getTime() - 60 * 60_000) }),
    ]);
    const replayedIds: string[] = [];

    // Silence the expected warn for the failing row.
    const originalWarn = console.warn;
    console.warn = () => {};
    let result;
    try {
      result = await tickEventAgentScheduledSends({
        store,
        now: () => NOW,
        buildDeps: (o) => tagDeps(o),
        runDue: async (send) => {
          replayedIds.push(send.agentSkill);
          if (send.agentSkill === "review-requester") throw new Error("twilio exploded on replay");
          return { sent: 1 };
        },
      });
    } finally {
      console.warn = originalWarn;
    }

    // Both rows were attempted (error isolation — the first failure didn't stop the loop).
    assert.equal(replayedIds.length, 2, "both due rows were attempted");

    // The throwing row was marked 'failed' with the error + attempts bumped.
    const boomMark = markCalls.find((m) => m.id === "boom");
    assert.ok(boomMark, "the failing row was marked");
    assert.equal(boomMark!.status, "failed");
    assert.match(String(boomMark!.error), /twilio exploded on replay/);
    assert.equal(rows.get("boom")?.status, "failed");
    assert.equal(rows.get("boom")?.attempts, 1, "a failed replay bumps attempts");

    // The healthy row still sent.
    assert.equal(rows.get("ok")?.status, "sent");

    assert.deepEqual(result, { claimed: 2, sent: 1, failed: 1 });
  });

  test("honors the row cap (limit)", async () => {
    const seed = Array.from({ length: 5 }, (_, i) =>
      row({ id: `r${i}`, dueAt: new Date(NOW.getTime() - (10 - i) * 60_000) }),
    );
    const { store } = makeFakeStore(seed);
    let replayed = 0;
    const result = await tickEventAgentScheduledSends({
      store,
      now: () => NOW,
      limit: 2,
      buildDeps: (o) => tagDeps(o),
      runDue: async () => {
        replayed += 1;
        return {};
      },
    });
    assert.equal(replayed, 2, "only `limit` rows are drained per tick");
    assert.deepEqual(result, { claimed: 2, sent: 2, failed: 0 });
  });

  test("empty queue → no replays, zeroed summary, no throw", async () => {
    const { store } = makeFakeStore([]);
    const result = await tickEventAgentScheduledSends({
      store,
      now: () => NOW,
      buildDeps: (o) => tagDeps(o),
      runDue: async () => ({}),
    });
    assert.deepEqual(result, { claimed: 0, sent: 0, failed: 0 });
  });

  test("the tick never throws even if mark(failed) itself errors (row left for a later tick)", async () => {
    // Replay throws AND the store's mark throws → the tick must still resolve.
    const base = makeFakeStore([row({ id: "r1" })]);
    const store: ScheduledEventAgentSendStore = {
      listDue: base.store.listDue,
      mark: async () => {
        throw new Error("db unavailable for mark");
      },
    };
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      await assert.doesNotReject(() =>
        tickEventAgentScheduledSends({
          store,
          now: () => NOW,
          buildDeps: (o) => tagDeps(o),
          runDue: async () => {
            throw new Error("replay failed");
          },
        }),
      );
    } finally {
      console.warn = originalWarn;
    }
  });

  test("idempotency: a row already marked 'sent' is not re-fired by a second tick", async () => {
    // After tick 1 marks the row 'sent', tick 2's listDue (pending-only) skips it.
    const { store, rows } = makeFakeStore([row({ id: "once" })]);
    let replayed = 0;
    const tickDeps: ScheduledSendTickDeps = {
      store,
      now: () => NOW,
      buildDeps: (o) => tagDeps(o),
      runDue: async () => {
        replayed += 1;
        return {};
      },
    };
    await tickEventAgentScheduledSends(tickDeps);
    await tickEventAgentScheduledSends(tickDeps);
    assert.equal(replayed, 1, "the row fires at most once across ticks");
    assert.equal(rows.get("once")?.status, "sent");
  });
});
