// v1.20.0 — operator-portal magic-link request form
//
// Single-stage flow: type email → "Send sign-in link" → action
// fires + email sent (or silent no-op for security). UI confirms
// "check your inbox" without leaking whether the email matched a
// real workspace owner.
//
// Distinct from CustomerLogin (lib/components/ui-customer/) which
// is a TWO-STAGE 6-digit-code flow. Operator UX optimized for the
// fewer-clicks-to-CRM-dashboard goal.

"use client";

import { useState, useTransition } from "react";

import { requestOperatorMagicLinkAction } from "@/lib/operator-portal/auth";

export type OperatorLoginFormProps = {
  orgSlug: string;
  orgName: string;
  initialError?: string | null;
  initialSentTo?: string | null;
};

export function OperatorLoginForm({
  orgSlug,
  orgName,
  initialError,
  initialSentTo,
}: OperatorLoginFormProps) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [sentTo, setSentTo] = useState<string | null>(initialSentTo ?? null);

  function handleSubmit() {
    startTransition(async () => {
      try {
        setError(null);
        const result = await requestOperatorMagicLinkAction({
          orgSlug,
          email,
        });
        if (result.ok) {
          setSentTo(result.sentTo);
        } else {
          setError(humanizeReason(result.reason));
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to send sign-in link",
        );
      }
    });
  }

  if (sentTo) {
    return (
      <div
        data-operator-login=""
        data-operator-login-stage="sent"
        data-operator-login-org={orgSlug}
        className="flex w-full max-w-md flex-col gap-4 p-7"
        style={{
          backgroundColor: "#FFFFFF",
          color: "#111",
          border: "1px solid #E5E5E1",
          borderRadius: "12px",
        }}
      >
        <header className="flex flex-col gap-1">
          <h1 className="text-[18px] font-semibold tracking-tight">
            Check your inbox
          </h1>
          <p className="text-[13px]" style={{ color: "#666" }}>
            We sent a sign-in link to{" "}
            <span className="font-medium" style={{ color: "#111" }}>
              {sentTo}
            </span>
            . Click the link to access {orgName}.
          </p>
        </header>
        <p className="text-[12px]" style={{ color: "#999" }}>
          The link is single-use and expires in 15 minutes. If you don&apos;t
          see it, check spam or request a new link below.
        </p>
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setError(null);
          }}
          className="text-[12px] underline self-start"
          style={{ color: "#666" }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div
      data-operator-login=""
      data-operator-login-stage="request"
      data-operator-login-org={orgSlug}
      className="flex w-full max-w-md flex-col gap-4 p-7"
      style={{
        backgroundColor: "#FFFFFF",
        color: "#111",
        border: "1px solid #E5E5E1",
        borderRadius: "12px",
      }}
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-[18px] font-semibold tracking-tight">
          Sign in to {orgName}
        </h1>
        <p className="text-[13px]" style={{ color: "#666" }}>
          Enter your email — we&apos;ll send you a one-click sign-in link.
        </p>
      </header>

      <label
        htmlFor="operator-login-email"
        className="text-[12px] font-medium"
        style={{ color: "#444" }}
      >
        Email
      </label>
      <input
        id="operator-login-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={pending}
        placeholder="you@example.com"
        autoComplete="email"
        className="px-3 py-2 w-full text-[14px]"
        style={{
          backgroundColor: "#F7F7F5",
          color: "#111",
          border: "1px solid #E5E5E1",
          borderRadius: "8px",
        }}
      />

      {error ? (
        <p
          data-operator-login-error=""
          role="alert"
          className="text-[12px]"
          style={{ color: "#B91C1C" }}
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending || !email}
        className="px-5 py-2.5 text-[13px] font-semibold"
        style={{
          backgroundColor: "#111",
          color: "#FFFFFF",
          borderRadius: "8px",
          border: "1px solid #111",
        }}
      >
        {pending ? "Sending…" : "Send sign-in link"}
      </button>

      <p className="text-[11px]" style={{ color: "#999" }}>
        Are you a customer of {orgName}?{" "}
        <a
          href={`/customer/${orgSlug}/login`}
          className="underline"
          style={{ color: "#666" }}
        >
          Sign in here →
        </a>
      </p>
    </div>
  );
}

function humanizeReason(reason: string): string {
  switch (reason) {
    case "missing_required_field":
      return "Please enter your email.";
    case "email_send_failed":
      return "We couldn't send the link. Please try again in a moment.";
    default:
      return "Something went wrong. Please try again.";
  }
}
