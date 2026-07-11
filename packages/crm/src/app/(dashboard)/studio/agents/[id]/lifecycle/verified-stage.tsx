// Agent lifecycle slice (T8) — Stage 02 "Verified".
//
// Move, don't fork: reuses the EXISTING RunEvalsCard (../run-evals) — the
// same runAgentEvalsAction + result rendering the flag-off editor's "Try it"
// section uses — wrapped with explain copy and the derived-scenarios list
// (from recordingSessions.derivedScenarios). Server-safe: no interaction of
// its own, so no "use client" here (RunEvalsCard carries its own).

import { RunEvalsCard } from "../run-evals";
import { EVAL_PASS_THRESHOLD } from "@/lib/agents/lifecycle/gate";
import type { EvalScenario } from "@/lib/agents/evals/eval-types";

export function VerifiedStage({
  templateId,
  scenarios,
}: {
  templateId: string;
  scenarios: EvalScenario[];
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-[var(--lc-muted)]">
        Your recordings are the test — each one became a scenario below. Seldon
        replays them against your agent before it goes live; it needs a{" "}
        {EVAL_PASS_THRESHOLD}%+ pass rate across at least one scenario to count
        as verified.
      </p>

      {scenarios.length > 0 ? (
        <ul className="space-y-1.5">
          {scenarios.map((s) => (
            <li
              key={s.id}
              className="rounded-lg border border-[var(--lc-line)] bg-[var(--lc-surface)]/30 px-3 py-2 text-sm"
            >
              <p className="font-medium text-[var(--lc-ink)]">{s.title}</p>
              <p className="text-xs text-[var(--lc-muted)]">
                {s.mustDo.length} must-do · {s.mustNotDo.length} must-not-do
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <RunEvalsCard templateId={templateId} />
    </div>
  );
}
