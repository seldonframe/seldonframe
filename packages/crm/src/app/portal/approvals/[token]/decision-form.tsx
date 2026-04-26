"use client";

// Customer-facing approval decision form.
// SLICE 10 PR 2 C5 per audit §8 + Max's gate-resolution prompt.
//
// Mobile-first: full-width buttons stack vertically on phones, side-
// by-side on >=sm. Comment field is optional. Success state is
// inline (no navigation) — confirmation reads professionally.
// Error states are specific (race-lost vs network vs other) so the
// client knows whether to retry.

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Decision = "approve" | "reject";
type Phase = "idle" | "submitting" | "success" | "error";

export function ApprovalDecisionForm({ token }: { token: string }) {
  const [comment, setComment] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [resultDecision, setResultDecision] = useState<Decision | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submit(decision: Decision) {
    setPhase("submitting");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/v1/approvals/magic-link/${token}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          comment: comment.trim() || undefined,
        }),
      });
      if (res.ok) {
        setResultDecision(decision);
        setPhase("success");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      // Map known server errors to user-friendly messages.
      const message =
        body.error === "already_resolved"
          ? "This request was already resolved by someone else."
          : body.error === "expired"
            ? "This link has expired."
            : body.error === "invalid_token"
              ? "This link is no longer valid."
              : "Something went wrong on our end. Please try again in a moment.";
      setErrorMessage(message);
      setPhase("error");
    } catch {
      setErrorMessage("Couldn't reach the server. Check your connection and try again.");
      setPhase("error");
    }
  }

  if (phase === "success" && resultDecision) {
    return (
      <div
        className="rounded-lg border p-5 text-center sm:text-left space-y-2"
        style={{
          borderColor: "var(--sf-border)",
          background: "var(--sf-card)",
        }}
      >
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--sf-foreground)" }}
        >
          {resultDecision === "approve" ? "Approved" : "Declined"}
        </h2>
        <p className="text-sm" style={{ color: "var(--sf-muted)" }}>
          {resultDecision === "approve"
            ? "Thank you. The team has been notified and will proceed."
            : "Thank you. The team has been notified and will not proceed with this request."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="approval-comment"
          className="text-xs font-medium block"
          style={{ color: "var(--sf-muted)" }}
        >
          Add a note (optional)
        </label>
        <Textarea
          id="approval-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="e.g., 'Looks good, please send.' or 'Hold off — let's discuss tomorrow.'"
          rows={3}
          maxLength={2000}
          disabled={phase === "submitting"}
          className="text-sm"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="button"
          variant="default"
          disabled={phase === "submitting"}
          onClick={() => submit("approve")}
          className="w-full sm:flex-1"
        >
          {phase === "submitting" ? "Submitting…" : "Approve"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={phase === "submitting"}
          onClick={() => submit("reject")}
          className="w-full sm:flex-1"
        >
          Decline
        </Button>
      </div>

      {phase === "error" && errorMessage ? (
        <p
          className="text-xs rounded border px-3 py-2"
          style={{
            borderColor: "var(--sf-warning)",
            background: "var(--sf-card)",
            color: "var(--sf-foreground)",
          }}
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
