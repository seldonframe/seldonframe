// Pure win-ladder state engine. Task 5 of the win-ladder + SeldonChat plan
// (Phase B foundation). No imports beyond types — Task 6 resolves real
// inputs from the DB and calls computeLadderState with them; Task 7 renders
// the result.

export type LadderStepId = "test_booking" | "make_it_yours" | "go_live" | "hire_agent";

export type LadderInputs = {
  hasBooking: boolean; // any non-template booking exists
  calendarConnected: boolean; // org-level Composio googlecalendar/outlook connection
  landingVersionCount: number; // r1 customize/version rows (>=1 means an edit happened)
  copilotEverUsed: boolean; // any copilot conversation has >=1 user message
  domainAttached: boolean; // organizations.settings.customDomain truthy
  shareUsed: boolean; // settings.activation.shareUsedAt stamped
  // Agents beyond the default chatbot AND excluding workspace_copilot. The
  // resolver guarantees both exclusions before this count reaches here, so
  // copilot usage alone never satisfies hire_agent.
  extraAgentCount: number;
};

export type LadderStep = { id: LadderStepId; done: boolean };

export type LadderState = {
  steps: LadderStep[];
  current: LadderStepId | null;
  completedCount: number;
};

export function computeLadderState(i: LadderInputs): LadderState {
  const steps: LadderStep[] = [
    { id: "test_booking", done: i.hasBooking },
    { id: "make_it_yours", done: i.landingVersionCount >= 1 || i.copilotEverUsed },
    { id: "go_live", done: i.domainAttached || i.shareUsed },
    { id: "hire_agent", done: i.extraAgentCount >= 1 },
  ];

  const firstNotDone = steps.find((s) => !s.done);
  const completedCount = steps.filter((s) => s.done).length;

  return {
    steps,
    current: firstNotDone ? firstNotDone.id : null,
    completedCount,
  };
}
