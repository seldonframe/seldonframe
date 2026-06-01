// Phase 1 voice — pure parsing of OpenAI Realtime function-call events.
//
// The Realtime WS surfaces a model-initiated tool call in TWO ways, and which
// one(s) you see depends on the model / session. We handle BOTH so the loop is
// robust regardless of what the API sends (the live call logs the raw event
// `type`s via `voice_call_realtime_event` so we can confirm which fired):
//
//   1. STREAMING path — the model streams the arguments JSON over a series of
//      `response.function_call_arguments.delta` events, then emits a single
//      `response.function_call_arguments.done` carrying the COMPLETE call:
//        { type:"response.function_call_arguments.done",
//          call_id, name, arguments }  // arguments is a JSON *string*
//      (Confirmed against the OpenAI Realtime API reference — server event
//      response.function_call_arguments.done.)
//
//   2. TERMINAL path — when the response finishes, `response.done` carries the
//      finalized items, and any tool call appears as a `function_call` item in
//      `response.output[]`:
//        { type:"response.done",
//          response:{ output:[
//            { type:"function_call", call_id, name, arguments } ] } }
//      (Confirmed against the OpenAI Realtime conversations guide + the
//      openai-realtime-solar-system GA demo's handleToolCall, which reads
//      name/arguments/call_id off the response.done output item.)
//
// Both variants yield the SAME triple (call_id, name, arguments-as-string), so
// this module normalizes them into a single `ParsedFunctionCall[]`. The driver
// keeps a Set of already-dispatched call_ids and passes it in, so a call that
// shows up on BOTH the streaming-done AND the terminal response.done is executed
// exactly once (no double-booking).
//
// Pure + total: no I/O, no throwing. Unknown/irrelevant events → []. This is the
// piece worth unit-testing; the WS wiring around it is integration-only.

/** A single normalized function call extracted from a realtime event. */
export type ParsedFunctionCall = {
  /** Transport-level id; rides back on the function_call_output item. */
  callId: string;
  /** The tool name the model wants to invoke. */
  name: string;
  /** Raw arguments JSON string (may be "" for a zero-arg call). */
  argumentsJson: string;
};

/** The Realtime `function_call_output` conversation item we send back after
 *  running a tool. Shape per the Realtime conversations guide:
 *    { type:"conversation.item.create",
 *      item:{ type:"function_call_output", call_id, output } } */
export type FunctionCallOutputItem = {
  type: "conversation.item.create";
  item: {
    type: "function_call_output";
    call_id: string;
    output: string;
  };
};

/** Narrow, defensive readers — the wire is untyped JSON. */
function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * Extract every function call carried by a single realtime event, skipping any
 * whose `call_id` is already in `seenCallIds`. Does NOT mutate `seenCallIds` —
 * the caller records ids only once it actually dispatches them, so a malformed
 * item we skip here never poisons the dedupe set.
 *
 * Handles both the streaming-done event and the terminal response.done event
 * (see file header). Returns [] for anything else, for missing/blank call_id or
 * name, and for already-seen call_ids.
 */
export function parseFunctionCalls(
  event: { type?: unknown } & Record<string, unknown>,
  seenCallIds: ReadonlySet<string>,
): ParsedFunctionCall[] {
  const type = asString(event?.type);
  if (!type) return [];

  // ── Streaming path: response.function_call_arguments.done ──
  if (type === "response.function_call_arguments.done") {
    const callId = asString(event.call_id);
    const name = asString(event.name);
    // `arguments` is a JSON string; OpenAI sends "" for a zero-arg call.
    const argumentsJson = asString(event.arguments) ?? "";
    if (!callId || !name || seenCallIds.has(callId)) return [];
    return [{ callId, name, argumentsJson }];
  }

  // ── Terminal path: response.done → response.output[] function_call items ──
  if (type === "response.done") {
    const response = event.response;
    const output =
      response && typeof response === "object"
        ? (response as { output?: unknown }).output
        : undefined;
    if (!Array.isArray(output)) return [];

    const calls: ParsedFunctionCall[] = [];
    const localSeen = new Set<string>(); // de-dupe within this one event too
    for (const raw of output) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      if (asString(item.type) !== "function_call") continue;
      const callId = asString(item.call_id);
      const name = asString(item.name);
      const argumentsJson = asString(item.arguments) ?? "";
      if (!callId || !name) continue;
      if (seenCallIds.has(callId) || localSeen.has(callId)) continue;
      localSeen.add(callId);
      calls.push({ callId, name, argumentsJson });
    }
    return calls;
  }

  return [];
}

/**
 * Build the `function_call_output` conversation item to send back to the model
 * after a tool runs. Pure. `output` is the already-serialized payload from
 * executeVoiceToolCall (its `output` on success, or an error string on failure).
 */
export function buildFunctionCallOutputItem(
  callId: string,
  output: string,
): FunctionCallOutputItem {
  return {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output,
    },
  };
}
