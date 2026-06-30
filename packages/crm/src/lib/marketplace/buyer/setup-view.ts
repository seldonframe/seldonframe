// Marketplace buyer onboarding — the setup-wizard VIEW assembler (pure; no I/O).
//
// The setup page loads the buyer's agent (a BuyerAgentView: deployment + steps +
// progress) and must hand the client wizard a SERIALIZABLE per-step seed:
//
//   • businessInfoSeed — the saved name / what-you-do / services / hours window
//     (the hours window is reconstructed from the structured Mon–Fri booking
//     policy back into the two HH:MM strings the form edits),
//   • connectedToolkits — for each connect_tool step's toolkit, whether the
//     deployment's calendarRef is already bound (the connected success state),
//   • phoneSeed — the current number + origin + a default area code + whether the
//     agent (a voice surface) requires a number,
//   • goLiveSummary — the recap rows (business name, phone, calendar) the go_live
//     screen lists.
//
// All pure mapping over the already-loaded view, so it unit-tests with a plain
// object and the page stays a thin caller. Shape-tolerant (jsonb edges).

import type { BuyerAgentView } from "@/lib/marketplace/buyer/buyer-deployment";
import type { BusinessInfoServiceInput } from "@/lib/marketplace/buyer/buyer-onboarding";
import { resolveDeploymentPersona } from "@/lib/agents/persona/deployment-customization";
import { deriveAreaCode } from "@/lib/deployments/margin";

// ─── view types (structurally match the wizard's client prop types) ──────────

export type BusinessInfoSeedView = {
  name: string;
  whatYouDo: string;
  services: BusinessInfoServiceInput[];
  hoursOpen: string;
  hoursClose: string;
};

export type PhoneSeedView = {
  phoneNumber: string | null;
  numberOrigin: string | null;
  defaultAreaCode: string;
  required: boolean;
};

export type GoLiveSummaryRowView = { label: string; value: string };

export type TestStepSeedView = {
  /** The agent's phone number (E.164), if any — the voice "test line". */
  phoneNumber: string | null;
  /** Whether this agent answers a phone (a voice surface) — drives the test UI. */
  isVoice: boolean;
  /** The agent's effective opening line (the first chat bubble). */
  greeting: string;
};

export type SetupWizardView = {
  businessInfoSeed: BusinessInfoSeedView;
  connectedToolkits: Record<string, boolean>;
  phoneSeed: PhoneSeedView;
  testStepSeed: TestStepSeedView;
  goLiveSummary: GoLiveSummaryRowView[];
};

// ─── helpers ─────────────────────────────────────────────────────────────────

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Reconstruct the single open/close HH:MM window the business_info form edits
 *  from the structured weekly booking policy. Reads Monday (weekday 1) — the
 *  business_info save writes the SAME window to Mon..Fri, so Monday is canonical;
 *  falls back to the first present weekday. Returns blanks when no valid window. */
function deriveHoursWindow(
  hours: Partial<Record<number, { start?: string; end?: string }>> | null | undefined,
): { open: string; close: string } {
  if (!hours || typeof hours !== "object") return { open: "", close: "" };
  const pick =
    hours[1] ??
    hours[2] ??
    hours[3] ??
    hours[4] ??
    hours[5] ??
    Object.values(hours)[0];
  const open = pick?.start ?? "";
  const close = pick?.end ?? "";
  // Only surface valid HH:MM (the <input type=time> needs that exact form).
  return {
    open: HHMM_RE.test(open) ? open : "",
    close: HHMM_RE.test(close) ? close : "",
  };
}

/** A voice agent is reached on the 'phone' surface (vs. embed/link for chat).
 *  Mirrors the deployment surface vocabulary; the engine adds a `phone` step only
 *  for a voice surface, so a present phone step is the real source of truth. */
function agentRequiresNumber(view: BuyerAgentView): boolean {
  return view.steps.some((s) => s.kind === "phone");
}

// ─── the assembler ───────────────────────────────────────────────────────────

/**
 * Build the serializable wizard view from a loaded BuyerAgentView. Pure.
 *
 * The connected-toolkit map keys on every connect_tool step's toolkit slug; a
 * toolkit is "connected" when the deployment's calendarRef.accountId is set AND
 * its provider matches the toolkit (today only the calendar toolkits bind a
 * calendarRef; other toolkits report not-connected, so their step always offers
 * the connect — harmless + truthful).
 */
export function buildSetupWizardView(view: BuyerAgentView): SetupWizardView {
  const d = view.deployment;
  const customization = d.customization ?? {};
  const businessInfo = customization.businessInfo ?? {};

  // Business-info prefill. `whatYouDo` isn't a distinct stored field (the persona
  // keeps a single description); we surface the saved business description if the
  // client context carries one, else blank.
  const whatYouDo = (d.clientContext?.soul?.businessDescription ?? "").trim();

  const services: BusinessInfoServiceInput[] = Array.isArray(customization.services)
    ? customization.services.map((s) => ({
        name: s?.name ?? "",
        ...(s?.price ? { price: s.price } : {}),
      }))
    : [];

  const window = deriveHoursWindow(d.bookingPolicy?.hours);

  const businessInfoSeed: BusinessInfoSeedView = {
    name: (businessInfo.name ?? "").trim() || d.clientName || "",
    whatYouDo,
    services,
    hoursOpen: window.open,
    hoursClose: window.close,
  };

  // Connected toolkits: which connect_tool step toolkits already have a binding.
  const ref = d.calendarRef;
  const calendarConnected = Boolean(ref?.accountId) && Boolean(ref?.provider);
  const connectedToolkits: Record<string, boolean> = {};
  for (const step of view.steps) {
    if (step.kind === "connect_tool" && step.toolkit) {
      connectedToolkits[step.toolkit] =
        calendarConnected && ref?.provider === step.toolkit;
    }
  }

  // Phone state.
  const isVoice = agentRequiresNumber(view);
  const phoneSeed: PhoneSeedView = {
    phoneNumber: d.phoneNumber ?? null,
    numberOrigin: d.numberOrigin ?? null,
    defaultAreaCode: deriveAreaCode(d.clientContact?.phone) ?? "",
    required: isVoice,
  };

  // Test-step seed: the agent's effective greeting (the deployment persona over
  // the template blueprint) for the first chat bubble, plus the test-line number.
  const bp = view.blueprint ?? {};
  const persona = resolveDeploymentPersona({
    templateGreeting: bp.greeting ?? null,
    customization,
    clientName: d.clientName,
  });
  const testStepSeed: TestStepSeedView = {
    phoneNumber: d.phoneNumber ?? null,
    isVoice,
    greeting:
      persona.greeting?.trim() ||
      `Thanks for calling ${businessInfoSeed.name || d.clientName || "us"}! How can I help today?`,
  };

  // Go-live recap rows.
  const goLiveSummary: GoLiveSummaryRowView[] = [];
  if (businessInfoSeed.name) {
    goLiveSummary.push({ label: "Business", value: businessInfoSeed.name });
  }
  if (phoneSeed.phoneNumber) {
    goLiveSummary.push({ label: "Phone", value: phoneSeed.phoneNumber });
  } else if (phoneSeed.required) {
    goLiveSummary.push({ label: "Phone", value: "Not set up yet" });
  }
  if (calendarConnected) {
    goLiveSummary.push({
      label: "Calendar",
      value: ref?.provider === "outlook" ? "Outlook connected" : "Google Calendar connected",
    });
  }

  return { businessInfoSeed, connectedToolkits, phoneSeed, testStepSeed, goLiveSummary };
}
