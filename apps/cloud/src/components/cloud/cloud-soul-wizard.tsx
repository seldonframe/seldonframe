"use client";

import { useState, useTransition } from "react";
import { saveCloudSoulAction } from "@/lib/cloud/actions";
import type { CloudSoulInput } from "@/lib/cloud/types";

const steps = ["business", "offer", "clients", "process", "voice", "priorities", "narrative", "review"] as const;

const initialState: CloudSoulInput = {
  businessName: "",
  offerType: "services",
  industry: "coaching",
  clientType: "B2C",
  clientLabel: "Client",
  processDescription: "",
  communicationStyle: "friendly-professional",
  priorities: ["new client acquisition", "pipeline visibility"],
  narrative: "",
};

export function CloudSoulWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<CloudSoulInput>(initialState);
  const [pending, startTransition] = useTransition();

  const step = steps[stepIndex];

  function update(patch: Partial<CloudSoulInput>) {
    setState((current) => ({ ...current, ...patch }));
  }

  return (
    <section style={{ border: "1px solid #1e293b", borderRadius: 12, background: "#111827", padding: 20, display: "grid", gap: 12 }}>
      <div>
        <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", textTransform: "uppercase" }}>Step {stepIndex + 1} of {steps.length}</p>
        <h2 style={{ margin: "6px 0 0", fontSize: 22 }}>Cloud Soul Wizard</h2>
      </div>

      {step === "business" ? (
        <input value={state.businessName} onChange={(e) => update({ businessName: e.target.value })} placeholder="Business name" style={{ height: 40, padding: "0 10px" }} />
      ) : null}

      {step === "offer" ? (
        <input value={state.offerType} onChange={(e) => update({ offerType: e.target.value })} placeholder="Offer type" style={{ height: 40, padding: "0 10px" }} />
      ) : null}

      {step === "clients" ? (
        <div style={{ display: "grid", gap: 8 }}>
          <input value={state.clientType} onChange={(e) => update({ clientType: e.target.value })} placeholder="Client type" style={{ height: 40, padding: "0 10px" }} />
          <input value={state.clientLabel} onChange={(e) => update({ clientLabel: e.target.value })} placeholder="Client label" style={{ height: 40, padding: "0 10px" }} />
        </div>
      ) : null}

      {step === "process" ? (
        <textarea value={state.processDescription} onChange={(e) => update({ processDescription: e.target.value })} placeholder="Describe your process" style={{ minHeight: 120, padding: 10 }} />
      ) : null}

      {step === "voice" ? (
        <input value={state.communicationStyle} onChange={(e) => update({ communicationStyle: e.target.value })} placeholder="Communication style" style={{ height: 40, padding: "0 10px" }} />
      ) : null}

      {step === "priorities" ? (
        <input
          value={state.priorities.join(", ")}
          onChange={(e) => update({ priorities: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}
          placeholder="Comma-separated priorities"
          style={{ height: 40, padding: "0 10px" }}
        />
      ) : null}

      {step === "narrative" ? (
        <textarea value={state.narrative} onChange={(e) => update({ narrative: e.target.value })} placeholder="Narrative context for your AI layer" style={{ minHeight: 120, padding: 10 }} />
      ) : null}

      {step === "review" ? (
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap", border: "1px solid #334155", borderRadius: 8, padding: 10 }}>{JSON.stringify(state, null, 2)}</pre>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <button type="button" disabled={stepIndex === 0 || pending} onClick={() => setStepIndex((n) => Math.max(0, n - 1))} style={{ height: 36, padding: "0 12px" }}>
          Back
        </button>

        {step === "review" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await saveCloudSoulAction(state);
              });
            }}
            style={{ height: 36, padding: "0 12px" }}
          >
            {pending ? "Saving..." : "Save Soul"}
          </button>
        ) : (
          <button type="button" disabled={pending} onClick={() => setStepIndex((n) => Math.min(steps.length - 1, n + 1))} style={{ height: 36, padding: "0 12px" }}>
            Next
          </button>
        )}
      </div>
    </section>
  );
}
