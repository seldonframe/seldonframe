// Deterministic replay — Reelier phase 2c, slice 1 (OBSERVE MODE ONLY).
//
// TraceRecorder: an in-memory collector for ONE agentic turn's tool-call
// sequence, built in the Reelier trace-record FORMAT (./trace-format.ts).
// Pure, DB-free — the caller (composio-event-dispatch-deps.ts) owns
// persisting `finish()`'s output.
//
// FAIL-SOFT BY CONTRACT: every method here is synchronous and never throws.
// A recorder is observation-only — it must never be able to slow down, fail,
// or change the outcome of the turn it's watching. `note`/`call`/`result`
// silently no-op once TRACE_MAX_RECORDS is reached (never throws, never grows
// unbounded).

import {
  makeCallRecord,
  makeMetaRecord,
  makeNoteRecord,
  makeResultRecord,
  TRACE_MAX_RECORDS,
  type TraceRecord,
} from "./trace-format";

export class TraceRecorder {
  private records: TraceRecord[] = [];
  private nextSeq = 1; // 0 is reserved for the meta record, appended in the constructor.
  private nextCallIndex = 0;
  private capped = false;

  constructor(input: { name: string; startedAt: string; wrapped: string[] }) {
    this.records.push(
      makeMetaRecord({ name: input.name, startedAt: input.startedAt, wrapped: input.wrapped }),
    );
  }

  /** True once TRACE_MAX_RECORDS has been reached — further record() calls
   *  are no-ops. Exposed for tests/observability, not required by callers. */
  get isCapped(): boolean {
    return this.capped;
  }

  private push(record: TraceRecord): void {
    if (this.capped) return;
    if (this.records.length >= TRACE_MAX_RECORDS) {
      this.capped = true;
      return;
    }
    this.records.push(record);
  }

  note(text: string, ts: string = new Date().toISOString()): void {
    try {
      this.push(makeNoteRecord({ seq: this.nextSeq++, ts, text }));
    } catch {
      // Observation must never affect the turn — swallow.
    }
  }

  /**
   * Record one tool call + its outcome. `run` is the tool's real
   * execute() — this wraps it, timing the call and recording ok/body
   * (or ok:false + the thrown error's message) WITHOUT altering what is
   * thrown or returned to the caller (the turn's own behavior is
   * byte-for-byte unaffected by observation).
   */
  async wrapCall<T>(tool: string, args: unknown, run: () => Promise<T>): Promise<T> {
    const i = this.nextCallIndex++;
    const callSeq = this.nextSeq++;
    try {
      this.push(
        makeCallRecord({ seq: callSeq, i, ts: new Date().toISOString(), tool, args }),
      );
    } catch {
      // Never let record-shaping affect the call itself.
    }

    const startedAt = Date.now();
    try {
      const result = await run();
      try {
        const resultSeq = this.nextSeq++;
        this.push(
          makeResultRecord({
            seq: resultSeq,
            i,
            ok: true,
            ms: Date.now() - startedAt,
            body: result,
          }),
        );
      } catch {
        // Recording failure must never mask a successful call.
      }
      return result;
    } catch (err) {
      try {
        const resultSeq = this.nextSeq++;
        const message = err instanceof Error ? err.message : String(err);
        this.push(
          makeResultRecord({
            seq: resultSeq,
            i,
            ok: false,
            ms: Date.now() - startedAt,
            body: { error: message },
          }),
        );
      } catch {
        // Recording failure must never mask the original throw.
      }
      throw err;
    }
  }

  /** Snapshot the collected records (meta first, then in seq order — the
   *  array is already append-ordered so this is just a defensive copy). */
  finish(): TraceRecord[] {
    return [...this.records];
  }

  /** Number of tool calls recorded so far (== call_count for the row). */
  get callCount(): number {
    return this.nextCallIndex;
  }
}
