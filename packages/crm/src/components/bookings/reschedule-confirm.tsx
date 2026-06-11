"use client";

import { useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// RescheduleConfirm — small confirm card shown after a PROSPECT booking is
// dragged to a new slot. Blocked-time drags skip this entirely (they move
// silently). Confirm fires the reschedule with notify:true so the contact
// gets the "your appointment moved" email; Cancel discards the drag.
//
// Positioned as a fixed overlay anchored near the drop point. Escape and
// outside-click both cancel (parity with CreatePopover).
// ---------------------------------------------------------------------------

export type RescheduleConfirmProps = {
  /** Booking title, e.g. "Consultation". */
  title: string;
  /** Human-readable target time, e.g. "Tue, Jun 16, 2:30 PM". */
  newTimeLabel: string;
  /** Linked contact's display name, e.g. "Jane Doe". */
  contactName: string;
  /** Viewport pixel anchor for the card (drop point). */
  anchorX: number;
  anchorY: number;
  onConfirm: () => void;
  onCancel: () => void;
};

export function RescheduleConfirm({
  title,
  newTimeLabel,
  contactName,
  anchorX,
  anchorY,
  onConfirm,
  onCancel,
}: RescheduleConfirmProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Escape + outside-click cancel the reschedule.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    function onMouseDown(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [onCancel]);

  // Keep the card inside the viewport.
  const cardW = 300;
  const cardH = 170;
  const left = Math.max(8, Math.min(anchorX, window.innerWidth - cardW - 8));
  const top = Math.max(8, Math.min(anchorY, window.innerHeight - cardH - 8));

  return (
    <div
      ref={cardRef}
      className="fixed z-50 rounded-xl border border-border bg-card p-4 shadow-lg"
      style={{ left, top, width: cardW }}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-sm text-foreground">
        Move <span className="font-semibold">{title}</span> to{" "}
        <span className="font-semibold">{newTimeLabel}</span> and email{" "}
        <span className="font-semibold">{contactName}</span>?
      </p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="crm-button-primary h-8 flex-1 text-xs"
          onClick={onConfirm}
        >
          Confirm
        </button>
        <button
          type="button"
          className="crm-button-ghost h-8 px-3 text-xs"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
