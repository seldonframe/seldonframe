// Per-step tool coverage report — pure, no I/O, no LLM. For every step in a
// FlowModel, decides whether SeldonFrame already has a real tool binding for
// it (green), whether it's plausibly bindable via an API an operator could
// wire up later (yellow), or whether it stays entirely with the human
// (red — e.g. a desktop app with no API surface SeldonFrame can reach).

import { findToolsByKeywords } from "@/lib/agents/generate/tool-catalog";
import type { CoverageEntry, FlowModel, WorkflowStep } from "./trace-schema";

// Action verbs that suggest a step is "API-shaped" — the kind of thing a web
// app's API can usually do (as opposed to, say, "review the screen").
const API_SHAPED_ACTION_KEYWORDS = [
  "send",
  "create",
  "update",
  "book",
  "schedule",
  "post",
  "log",
  "add",
  "delete",
  "remove",
  "invite",
  "notify",
  "assign",
];

// Markers that indicate a native desktop app with no reachable API surface —
// these never qualify for the yellow tier no matter how actiony the verb is.
const DESKTOP_APP_MARKERS = ["desktop", "native app", "installed app"];

function isDesktopApp(app: string): boolean {
  const normalized = app.toLowerCase();
  return DESKTOP_APP_MARKERS.some((marker) => normalized.includes(marker));
}

function isApiShapedAction(action: string): boolean {
  const normalized = action.toLowerCase();
  return API_SHAPED_ACTION_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function coverStep(step: WorkflowStep): CoverageEntry {
  const matches = findToolsByKeywords(`${step.app} ${step.action}`);
  const match = matches[0];

  if (match) {
    const toolkit = match.toolkitSlug ?? match.id;
    return {
      stepIndex: step.index,
      tier: "green",
      toolkit,
      reason: `matched ${toolkit}`,
    };
  }

  if (!isDesktopApp(step.app) && isApiShapedAction(step.action)) {
    return {
      stepIndex: step.index,
      tier: "yellow",
      reason: "likely API-doable — needs approval gate",
    };
  }

  return {
    stepIndex: step.index,
    tier: "red",
    reason: "no tool binding — stays with the human",
  };
}

/**
 * Produces one CoverageEntry per step in `model`, in the same order as
 * `model.steps`. Pure — safe to call from anywhere, no I/O.
 */
export function coverFlowModel(model: FlowModel): CoverageEntry[] {
  return model.steps.map(coverStep);
}
