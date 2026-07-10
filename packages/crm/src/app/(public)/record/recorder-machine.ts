// packages/crm/src/app/(public)/record/recorder-machine.ts
//
// Pure state machine for the /record capture page — no I/O, no browser
// APIs. record-client.tsx drives this reducer with useReducer; capture.ts,
// the upload client, and the recordings API routes are all called from the
// client component's effects, never from here. Kept pure + exported so
// every transition rule is directly testable (recorder-machine.spec.ts).
//
// Transition rules (see plan Task 9):
//   - only one slot may be recording/uploading/compiling at a time — a
//     START_RECORDING while another slot is busy is a no-op (same state
//     reference returned, so callers can cheaply detect "nothing happened").
//   - TRACED moves phase to "recap" the first time any slot becomes traced;
//     it never regresses phase back out of recap on subsequent slots.
//   - SLOT_FAILED returns the slot to "empty" but keeps the error message
//     visible on the slot.
//   - APPROVED only fires from "recap" — a no-op everywhere else.
//   - any action naming an out-of-range slotIndex is a no-op.

import { MAX_RECORDINGS_PER_SESSION } from "@/lib/recordings/policy";
import type { CoverageEntry, FlowModel } from "@/lib/recordings/trace-schema";

export type SlotStatus = "empty" | "recording" | "uploading" | "compiling" | "traced" | "failed";

export type RecorderSlot = {
  slotIndex: number;
  label: string | null;
  status: SlotStatus;
  error?: string;
  whatChanged?: string[];
};

export type InterviewTurn = { role: "user" | "seldon"; text: string };

export type RecorderState = {
  sessionId: string | null;
  token: string | null;
  slots: RecorderSlot[];
  activeSlot: number | null;
  flowModel: FlowModel | null;
  coverage: CoverageEntry[];
  openQuestions: string[];
  interview: InterviewTurn[];
  phase: "landing" | "capturing" | "recap" | "approved";
};

export type RehydratedSlot = {
  slotIndex: number;
  label: string | null;
  status: "traced" | "failed" | "uploaded";
};

export type RecorderAction =
  | { type: "SESSION_READY"; sessionId: string; token: string }
  | {
      type: "REHYDRATED";
      sessionId: string;
      token: string;
      status: string;
      flowModel: FlowModel | null;
      openQuestions: string[];
      slots: RehydratedSlot[];
      /** True on the authenticated return from the claim redirect
       *  (?claimed=1). A recapped session then lands in phase "approved" —
       *  the operator already clicked approve pre-claim (that dispatch died
       *  with the page navigation), and rendering "recap" again would show
       *  the claim CTA and loop them back through /signup forever (B-1). The
       *  server-side recapped→approved transition still happens in
       *  compile-agent's approve:true — this only picks which button shows.
       *  Absent = false (an ordinary un-claimed refresh). */
      claimed?: boolean;
    }
  | { type: "START_RECORDING"; slotIndex: number }
  | { type: "STOP_RECORDING"; slotIndex: number }
  | { type: "UPLOADED"; slotIndex: number }
  | {
      type: "TRACED";
      slotIndex: number;
      flowModel: FlowModel;
      coverage: CoverageEntry[];
      whatChanged: string[];
      openQuestions: string[];
    }
  | { type: "SLOT_FAILED"; slotIndex: number; error: string }
  | { type: "SET_LABEL"; slotIndex: number; label: string }
  // Split from the old single INTERVIEW_TURN so the user's sent message
  // renders immediately, before the (slow) LLM reply comes back — see plan
  // Task "interview optimistic UI". USER_SENT appends only the user turn;
  // REPLY appends the seldon turn + refreshes openQuestions once the
  // response arrives.
  | { type: "INTERVIEW_USER_SENT"; user: string }
  | { type: "INTERVIEW_REPLY"; seldon: string; openQuestions: string[] }
  | { type: "MODEL_UPDATED"; flowModel: FlowModel; openQuestions: string[] }
  | { type: "GO_RECAP" }
  | { type: "APPROVED" };

const BUSY_STATUSES: ReadonlySet<SlotStatus> = new Set(["recording", "uploading", "compiling"]);

function isInRange(slotIndex: number): boolean {
  return Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < MAX_RECORDINGS_PER_SESSION;
}

export function initialRecorderState(): RecorderState {
  return {
    sessionId: null,
    token: null,
    slots: Array.from({ length: MAX_RECORDINGS_PER_SESSION }, (_, slotIndex) => ({
      slotIndex,
      label: null,
      status: "empty" as SlotStatus,
    })),
    activeSlot: null,
    flowModel: null,
    coverage: [],
    openQuestions: [],
    interview: [],
    phase: "landing",
  };
}

function replaceSlot(
  state: RecorderState,
  slotIndex: number,
  update: (slot: RecorderSlot) => RecorderSlot,
): RecorderState {
  return {
    ...state,
    slots: state.slots.map((slot) => (slot.slotIndex === slotIndex ? update(slot) : slot)),
  };
}

export function recorderReducer(state: RecorderState, action: RecorderAction): RecorderState {
  switch (action.type) {
    case "SESSION_READY":
      return {
        ...state,
        sessionId: action.sessionId,
        token: action.token,
        phase: "capturing",
      };

    case "REHYDRATED": {
      const bySlotIndex = new Map(action.slots.map((s) => [s.slotIndex, s]));
      const slots = state.slots.map((slot) => {
        const row = bySlotIndex.get(slot.slotIndex);
        if (!row) return slot;
        if (row.status === "traced") {
          return { ...slot, label: row.label, status: "traced" as SlotStatus, error: undefined };
        }
        if (row.status === "failed") {
          return {
            ...slot,
            label: row.label,
            status: "failed" as SlotStatus,
            error: "compile failed — re-record",
          };
        }
        // 'uploaded' on a rehydrated (stale) session is not the in-flight
        // "compiling" it once was — there's no process left to resume, so
        // it goes back to "empty" (keeping the label) rather than a status
        // this reducer can never move out of.
        return { ...slot, label: row.label, status: "empty" as SlotStatus, error: undefined };
      });

      const hasFlowModel = action.flowModel !== null;
      const phase: RecorderState["phase"] =
        hasFlowModel &&
        (action.status === "recapped" || action.status === "approved" || action.status === "compiled")
          ? action.status === "recapped" && !action.claimed
            ? "recap"
            : "approved"
          : "capturing";

      return {
        ...state,
        sessionId: action.sessionId,
        token: action.token,
        slots,
        flowModel: action.flowModel,
        coverage: action.flowModel?.coverage ?? [],
        openQuestions: action.openQuestions,
        phase,
      };
    }

    case "START_RECORDING": {
      if (!isInRange(action.slotIndex)) return state;
      const anyBusy = state.slots.some((slot) => BUSY_STATUSES.has(slot.status));
      if (anyBusy) return state;
      const next = replaceSlot(state, action.slotIndex, (slot) => ({
        ...slot,
        status: "recording",
        error: undefined,
      }));
      return { ...next, activeSlot: action.slotIndex };
    }

    case "STOP_RECORDING": {
      if (!isInRange(action.slotIndex)) return state;
      return replaceSlot(state, action.slotIndex, (slot) => ({ ...slot, status: "uploading" }));
    }

    case "UPLOADED": {
      if (!isInRange(action.slotIndex)) return state;
      return replaceSlot(state, action.slotIndex, (slot) => ({ ...slot, status: "compiling" }));
    }

    case "TRACED": {
      if (!isInRange(action.slotIndex)) return state;
      const wasFirstTraced = !state.slots.some((slot) => slot.status === "traced");
      const next = replaceSlot(state, action.slotIndex, (slot) => ({
        ...slot,
        status: "traced",
        error: undefined,
        whatChanged: action.whatChanged,
      }));
      return {
        ...next,
        activeSlot: null,
        flowModel: action.flowModel,
        coverage: action.coverage,
        openQuestions: action.openQuestions,
        phase: wasFirstTraced ? "recap" : next.phase,
      };
    }

    case "SLOT_FAILED": {
      if (!isInRange(action.slotIndex)) return state;
      const next = replaceSlot(state, action.slotIndex, (slot) => ({
        ...slot,
        status: "empty",
        error: action.error,
      }));
      return { ...next, activeSlot: null };
    }

    case "SET_LABEL": {
      if (!isInRange(action.slotIndex)) return state;
      return replaceSlot(state, action.slotIndex, (slot) => ({ ...slot, label: action.label }));
    }

    case "INTERVIEW_USER_SENT":
      return {
        ...state,
        interview: [...state.interview, { role: "user", text: action.user }],
      };

    case "INTERVIEW_REPLY":
      return {
        ...state,
        interview: [...state.interview, { role: "seldon", text: action.seldon }],
        openQuestions: action.openQuestions,
      };

    // The interview merged an answer into the FlowModel — swap
    // flowModel/coverage/openQuestions so the recap reflects what Seldon
    // just said it learned, WITHOUT touching slots or phase (this is not a
    // new recording — nothing about slot progress changed).
    case "MODEL_UPDATED":
      return {
        ...state,
        flowModel: action.flowModel,
        coverage: action.flowModel.coverage,
        openQuestions: action.openQuestions,
      };

    case "GO_RECAP":
      return { ...state, phase: "recap" };

    case "APPROVED":
      if (state.phase !== "recap") return state;
      return { ...state, phase: "approved" };

    default:
      return state;
  }
}
