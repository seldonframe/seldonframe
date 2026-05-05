"use client";

// v1.7.0 — Yes/No buttons on the device-auth approval page. Calls
// /api/v1/auth/approve or /api/v1/auth/reject with the atok in the
// body. Renders inline success/failure state — no router push, no
// reload, so the polling MCP can resolve and the page can simply tell
// the operator "go back to your IDE."

import { useState } from "react";

export function ApprovalActions({ atok }: { atok: string }) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "submitting"; action: "approve" | "reject" }
    | { kind: "approved" }
    | { kind: "rejected" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const submit = async (action: "approve" | "reject") => {
    setState({ kind: "submitting", action });
    try {
      const res = await fetch(`/api/v1/auth/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atok }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setState({
          kind: "error",
          message: body.error ?? `${res.status} ${res.statusText}`,
        });
        return;
      }
      setState({ kind: action === "approve" ? "approved" : "rejected" });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (state.kind === "approved") {
    return (
      <SuccessBox>
        <strong>Authorized.</strong> Return to your IDE — the connection
        should complete in a few seconds.
      </SuccessBox>
    );
  }

  if (state.kind === "rejected") {
    return (
      <RejectedBox>
        <strong>Rejected.</strong> The device cannot connect to your
        workspace.
      </RejectedBox>
    );
  }

  if (state.kind === "error") {
    return (
      <ErrorBox>
        Something went wrong: <code>{state.message}</code>. Run{" "}
        <code>connect_workspace</code> again from your IDE.
      </ErrorBox>
    );
  }

  const submitting = state.kind === "submitting";
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        marginTop: 24,
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        disabled={submitting}
        onClick={() => submit("approve")}
        style={{
          flex: 1,
          minWidth: 160,
          padding: "12px 24px",
          background: submitting ? "#a3d1da" : "#0e7490",
          color: "#ffffff",
          border: "none",
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 600,
          cursor: submitting ? "wait" : "pointer",
        }}
      >
        {state.kind === "submitting" && state.action === "approve"
          ? "Authorizing…"
          : "Yes, authorize"}
      </button>
      <button
        type="button"
        disabled={submitting}
        onClick={() => submit("reject")}
        style={{
          flex: 1,
          minWidth: 160,
          padding: "12px 24px",
          background: "#ffffff",
          color: "#444",
          border: "1px solid #d4d4d0",
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 500,
          cursor: submitting ? "wait" : "pointer",
        }}
      >
        {state.kind === "submitting" && state.action === "reject"
          ? "Rejecting…"
          : "No, this wasn't me"}
      </button>
    </div>
  );
}

function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 24,
        padding: 16,
        background: "#f0fdf4",
        border: "1px solid #bbf7d0",
        borderRadius: 8,
        color: "#15803d",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

function RejectedBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 24,
        padding: 16,
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: 8,
        color: "#b91c1c",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 24,
        padding: 16,
        background: "#fffbeb",
        border: "1px solid #fde68a",
        borderRadius: 8,
        color: "#92400e",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}
