// Agent Eval Harness — E2: the simulated customer + the eval run loop.
//
// runEvalScenario drives ONE scenario to a finished EvalTranscript by alternating
// turns between two dependency-injected sides:
//   • the simulated CUSTOMER (an LLM in E5) — opens with scenario.opening, then
//     reacts to each agent reply, and signals `done:true` when satisfied;
//   • the AGENT (its real conversation loop in E5) — replies given the turns so far.
//
// This module is PURE ORCHESTRATION: it owns the alternating cadence + the
// termination rules and NOTHING else. All I/O (the LLM sim, the agent runtime)
// is injected via `deps`, so the unit tests run with plain fakes — no network,
// no Anthropic, no Postgres. It is a plain module (no "use server"): safe from a
// route handler, an action, a runtime, or a test.
//
// E5 wiring (what the deps adapt to):
//   • `agentReply` adapts the canonical agent loop. The real surface is
//     `executeTurn({ conversationId, userMessage }) → { ok, assistantMessage }`
//     (src/lib/agents/runtime.ts), reached via run-channel-turn's orchestrator.
//     That layer stores turns as `role:"user"|"assistant"` + `content`; the eval
//     layer speaks `role:"customer"|"agent"` + `text`. The E5 adapter maps
//     customer↔user / agent↔assistant and text↔content, feeding the agent the
//     LAST customer turn as `userMessage` (the conversation history is persisted
//     on the agent's own thread, so the adapter need only pass the newest line).
//   • `simCustomer` adapts an LLM call that's handed the scenario + the turns so
//     far and asked to produce the customer's next line (and whether it's done).
//
// ROBUST + NEVER THROWS: a dep that throws ends the transcript gracefully (we
// keep whatever turns we have and stop). The `maxTurns` cap is the hard stop
// against an agent/sim that never terminates. An empty reply twice from either
// side also ends the loop, so a wedged/blank model can't spin forever.

import type { EvalScenario, EvalTranscript, EvalTurn } from "./eval-types";

/**
 * The simulated customer. Given the scenario + the conversation so far (which
 * already includes its own opening as turn 0), returns the customer's NEXT line
 * and whether the conversation is finished from the customer's point of view.
 *  - `text` — the customer's reply (may be "" if it has nothing to add).
 *  - `done` — true once the customer is satisfied (booked / answered / giving up).
 */
export type SimCustomerReply = (args: {
  scenario: EvalScenario;
  turns: EvalTurn[];
}) => Promise<{ text: string; done?: boolean }>;

/**
 * The agent under test. Given the conversation so far, returns the agent's next
 * reply. In E5 this wraps executeTurn (role/text ↔ user/assistant/content).
 */
export type AgentReply = (args: { turns: EvalTurn[] }) => Promise<{ text: string }>;

/** Default hard cap on AGENT turns — bounds token cost and is the ultimate
 *  guard against a sim/agent pair that never says `done`. */
const DEFAULT_MAX_TURNS = 6;

/**
 * Run a scenario against an agent by alternating customer ↔ agent turns.
 *
 * Cadence:
 *   1. Seed the transcript with the customer's `scenario.opening` (role "customer").
 *   2. Loop, each iteration:
 *        a. `agentReply({ turns })` → push an "agent" turn.
 *        b. `simCustomer({ scenario, turns })` → push a "customer" turn.
 *   3. Stop when ANY holds:
 *        • the sim returns `done:true` (after recording its final line);
 *        • we've recorded `maxTurns` agent turns (the hard stop);
 *        • either side returns empty text on two consecutive of its own turns;
 *        • either side throws (graceful end — keep what we have).
 *
 * The result strictly alternates customer → agent → customer → … starting with
 * the opening, so `turns[0]` is always the customer opening. PURE — the only I/O
 * is the injected `simCustomer` / `agentReply`. Never throws.
 */
export async function runEvalScenario(
  scenario: EvalScenario,
  deps: {
    simCustomer: SimCustomerReply;
    agentReply: AgentReply;
    maxTurns?: number;
  },
): Promise<EvalTranscript> {
  const maxTurns =
    deps.maxTurns && deps.maxTurns > 0 ? Math.floor(deps.maxTurns) : DEFAULT_MAX_TURNS;

  // Seed with the customer's opening — turn[0] is ALWAYS the customer.
  const turns: EvalTurn[] = [{ role: "customer", text: scenario.opening }];

  let agentTurns = 0;
  // Track consecutive empty replies PER SIDE — two in a row from the same side
  // means that side has nothing left, so we bail instead of spinning.
  let agentEmptyStreak = 0;
  let customerEmptyStreak = 0;
  // The opening itself counts toward the customer's empty streak (a blank
  // opening + a blank follow-up = two empties → stop).
  if (scenario.opening.trim() === "") customerEmptyStreak = 1;

  while (agentTurns < maxTurns) {
    // ── Agent's turn ────────────────────────────────────────────────────────
    let agentText: string;
    try {
      const reply = await deps.agentReply({ turns });
      agentText = reply?.text ?? "";
    } catch {
      // The agent side blew up — end gracefully with whatever we have.
      break;
    }
    turns.push({ role: "agent", text: agentText });
    agentTurns += 1;

    if (agentText.trim() === "") {
      agentEmptyStreak += 1;
      if (agentEmptyStreak >= 2) break; // agent went blank twice → stop
    } else {
      agentEmptyStreak = 0;
    }

    // Respect the hard cap BEFORE soliciting another customer line, so a
    // maxTurns:N run ends with exactly N agent turns (no trailing customer turn).
    if (agentTurns >= maxTurns) break;

    // ── Customer's turn ─────────────────────────────────────────────────────
    let customerText: string;
    let done: boolean;
    try {
      const reply = await deps.simCustomer({ scenario, turns });
      customerText = reply?.text ?? "";
      done = reply?.done === true;
    } catch {
      // The sim blew up — end gracefully with whatever we have.
      break;
    }
    turns.push({ role: "customer", text: customerText });

    if (customerText.trim() === "") {
      customerEmptyStreak += 1;
      if (customerEmptyStreak >= 2) break; // customer went blank twice → stop
    } else {
      customerEmptyStreak = 0;
    }

    if (done) break; // sim is satisfied — its final line is already recorded
  }

  return { scenarioId: scenario.id, turns };
}
