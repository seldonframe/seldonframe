// v1.21.0 — customer-portal appointment row (Upcoming / Past variants)
//
// Inline cancel + reschedule (request) actions on each upcoming row.
// Past rows are read-only (no actions; just a status pill). Light
// Twenty-CRM styling consistent with the shell.

"use client";

import { useState, useTransition } from "react";

import { cancelBookingAction } from "@/lib/customer-portal/appointment-actions";

export type CustomerAppointmentRowProps = {
  orgSlug: string;
  bookingId: string;
  title: string;
  /** ISO timestamp string (booking.startsAt). */
  startsAt: string;
  status: string;
  notes: string | null;
  meetingUrl: string | null;
  rescheduleLabel: string;
  cancelLabel: string;
  variant: "upcoming" | "past";
};

export function CustomerAppointmentRow({
  orgSlug,
  bookingId,
  title,
  startsAt,
  status,
  notes,
  meetingUrl,
  rescheduleLabel,
  cancelLabel,
  variant,
}: CustomerAppointmentRowProps) {
  const date = new Date(startsAt);
  const dateLine = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeLine = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const [pending, startTransition] = useTransition();
  // v1.22 — reschedule moved to a dedicated page (/customer/<slug>/
  // reschedule/<bookingId>) with a real slot picker. Cancel stays
  // inline with a simple reason textarea, so confirmKind is now
  // simpler (cancel-only).
  const [confirmKind, setConfirmKind] = useState<null | "cancel">(null);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<
    null | { kind: "ok"; message: string } | { kind: "error"; message: string }
  >(null);
  const [localStatus, setLocalStatus] = useState(status);

  const isCancellable =
    variant === "upcoming" &&
    (localStatus === "scheduled" || localStatus === "confirmed");

  function submit() {
    if (!confirmKind) return;
    startTransition(async () => {
      try {
        const res = await cancelBookingAction({
          orgSlug,
          bookingId,
          reason: reason.trim() || undefined,
        });
        if (res.ok) {
          setLocalStatus("cancelled");
          setFeedback({
            kind: "ok",
            message: "Cancelled. We'll let the team know.",
          });
          setConfirmKind(null);
        } else {
          setFeedback({ kind: "error", message: humanizeReason(res.reason) });
        }
      } catch (err) {
        setFeedback({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Something went wrong. Please try again.",
        });
      }
    });
  }

  if (variant === "past") {
    return (
      <div
        className="flex items-center justify-between px-2 py-2 text-[13px]"
        style={{ borderRadius: "6px" }}
      >
        <span className="min-w-0 flex-1 truncate" style={{ color: "#111" }}>
          {title}
        </span>
        <span className="text-[12px] mr-3" style={{ color: "#888" }}>
          {dateLine}
        </span>
        <StatusPill status={localStatus} />
      </div>
    );
  }

  return (
    <div
      data-customer-appointment-row=""
      className="px-3 py-3"
      style={{
        backgroundColor: "#F7F7F5",
        border: "1px solid #E5E5E1",
        borderRadius: "10px",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-[14px] font-semibold"
            style={{ color: "#111" }}
          >
            {title}
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "#666" }}>
            {dateLine} <span style={{ color: "#999" }}>·</span> {timeLine}
          </p>
          {notes ? (
            <p
              className="mt-2 text-[12px] whitespace-pre-line"
              style={{ color: "#888" }}
            >
              {notes}
            </p>
          ) : null}
        </div>
        <StatusPill status={localStatus} />
      </div>

      {meetingUrl ? (
        <div className="mt-2">
          <a
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center px-3 text-[12px] font-medium"
            style={{
              backgroundColor: "#FFFFFF",
              color: "#111",
              border: "1px solid #E5E5E1",
              borderRadius: "6px",
            }}
          >
            Join meeting
          </a>
        </div>
      ) : null}

      {feedback ? (
        <p
          className="mt-2 text-[12px]"
          style={{
            color: feedback.kind === "ok" ? "#15803D" : "#B91C1C",
          }}
        >
          {feedback.message}
        </p>
      ) : null}

      {isCancellable && !confirmKind ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* v1.22 — Reschedule now links to the slot-picker page
              (real availability, atomic update). Cancel stays inline
              with the simple reason textarea. */}
          <a
            href={`/customer/${orgSlug}/reschedule/${bookingId}`}
            className="inline-flex h-8 items-center px-3 text-[12px] font-medium"
            style={{
              backgroundColor: "#FFFFFF",
              color: "#111",
              border: "1px solid #E5E5E1",
              borderRadius: "6px",
            }}
          >
            {rescheduleLabel}
          </a>
          <button
            type="button"
            onClick={() => {
              setConfirmKind("cancel");
              setReason("");
              setFeedback(null);
            }}
            className="inline-flex h-8 items-center px-3 text-[12px] font-medium"
            style={{
              backgroundColor: "#FFFFFF",
              color: "#666",
              border: "1px solid #E5E5E1",
              borderRadius: "6px",
            }}
          >
            {cancelLabel}
          </button>
        </div>
      ) : null}

      {confirmKind === "cancel" ? (
        <div className="mt-3 space-y-2">
          <label
            className="text-[11px] font-medium"
            style={{ color: "#444" }}
          >
            Reason (optional, helps us plan)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={pending}
            rows={2}
            className="w-full px-3 py-2 text-[13px]"
            style={{
              backgroundColor: "#FFFFFF",
              color: "#111",
              border: "1px solid #E5E5E1",
              borderRadius: "8px",
              resize: "vertical",
            }}
            placeholder="e.g. plans changed"
          />
          <FormFooterButtons
            primaryLabel={pending ? "Sending…" : "Confirm cancel"}
            primaryColor="#B91C1C"
            onPrimary={submit}
            onCancel={() => {
              setConfirmKind(null);
              setReason("");
              setFeedback(null);
            }}
            pending={pending}
          />
        </div>
      ) : null}

      {/* v1.22 — Reschedule no longer renders inline; it links out to
          /customer/<slug>/reschedule/<bookingId> for the slot picker. */}
    </div>
  );
}

function FormFooterButtons({
  primaryLabel,
  primaryColor,
  onPrimary,
  onCancel,
  pending,
}: {
  primaryLabel: string;
  primaryColor: string;
  onPrimary: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onPrimary}
        disabled={pending}
        className="inline-flex h-8 items-center px-3 text-[12px] font-semibold"
        style={{
          backgroundColor: primaryColor,
          color: "#FFFFFF",
          border: "1px solid",
          borderColor: primaryColor,
          borderRadius: "6px",
        }}
      >
        {primaryLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="inline-flex h-8 items-center px-3 text-[12px] font-medium"
        style={{
          backgroundColor: "#FFFFFF",
          color: "#666",
          border: "1px solid #E5E5E1",
          borderRadius: "6px",
        }}
      >
        Nevermind
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const palette = pillPalette(status);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{
        backgroundColor: palette.bg,
        color: palette.text,
        borderRadius: "9999px",
      }}
    >
      {prettyStatus(status)}
    </span>
  );
}

function pillPalette(status: string): { bg: string; text: string } {
  switch (status) {
    case "scheduled":
    case "confirmed":
      return { bg: "#DCFCE7", text: "#166534" };
    case "completed":
      return { bg: "#E0E7FF", text: "#3730A3" };
    case "cancelled":
    case "no_show":
      return { bg: "#F3F4F6", text: "#6B7280" };
    default:
      return { bg: "#F3F4F6", text: "#6B7280" };
  }
}

function prettyStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeReason(reason: string): string {
  switch (reason) {
    case "missing_required_field":
      return "Missing required information.";
    case "booking_not_found":
      return "We couldn't find that appointment.";
    default:
      return "Something went wrong. Please try again.";
  }
}
