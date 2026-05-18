"use client";

// 2026-05-18 — Customer-facing booking management view.
//
// Lives at /booking/manage/[bookingId]?token=<signed>. The customer
// lands here from their confirmation email or SMS and can:
//   - See their booking details (title, date, time)
//   - Cancel (calls cancelBookingByTokenAction)
//   - Jump to picking a different time (links to /book/<slug>)
//
// We don't show a true reschedule UI in v1 — picking a new time
// re-uses the existing booking flow. A future slice can wire a
// proper "swap slot" action on a single page.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, Clock, CheckCircle2, XCircle, ArrowRight, Phone } from "lucide-react";
import { cancelBookingByTokenAction } from "@/lib/bookings/actions";

type Props = {
  bookingId: string;
  token: string;
  title: string;
  fullName: string | null;
  email: string | null;
  startsAtIso: string;
  endsAtIso: string;
  status: string;
  workspaceTimezone: string;
  orgSlug: string;
  bookingSlug: string;
  headerLogoUrl: string | null;
  headerName: string;
  businessPhone: string | null;
  recentlyCancelled: boolean;
};

function formatDate(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      timeZone: tz,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function BookingManageView(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Local cancellation state so the UI flips immediately after the
  // action succeeds — the searchParam refresh round-trip is
  // belt-and-suspenders.
  const [localCancelled, setLocalCancelled] = useState(false);

  const isCancelled = props.status === "cancelled" || props.recentlyCancelled || localCancelled;
  const dateLabel = formatDate(props.startsAtIso, props.workspaceTimezone);
  const timeLabel = `${formatTime(props.startsAtIso, props.workspaceTimezone)}–${formatTime(props.endsAtIso, props.workspaceTimezone)}`;

  function handleCancel() {
    setError(null);
    if (typeof window !== "undefined" && !window.confirm("Cancel this appointment? This can't be undone.")) {
      return;
    }
    startTransition(async () => {
      const result = await cancelBookingByTokenAction({
        bookingId: props.bookingId,
        token: props.token,
      });
      if (!result.ok) {
        setError(
          result.error === "invalid_token"
            ? "This link is no longer valid."
            : result.error === "booking_not_found"
              ? "We couldn't find that booking."
              : "Something went wrong. Please call the business directly.",
        );
        return;
      }
      setLocalCancelled(true);
      // Reflect ?cancelled=1 in the URL so a refresh shows the same
      // state without re-clicking.
      router.replace(`/booking/manage/${props.bookingId}?token=${encodeURIComponent(props.token)}&cancelled=1`);
    });
  }

  return (
    <div className="w-full max-w-md">
      <header className="flex items-center gap-3 mb-6 px-1">
        {props.headerLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={props.headerLogoUrl}
            alt={`${props.headerName} logo`}
            className="h-9 w-auto object-contain"
          />
        ) : null}
        <p className="text-base font-semibold text-slate-900">{props.headerName}</p>
      </header>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        {isCancelled ? (
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 text-rose-700 px-3 py-1 text-xs font-medium mb-4">
              <XCircle className="size-3.5" />
              Cancelled
            </div>
            <h1 className="text-xl font-semibold text-slate-900 mb-1">{props.title}</h1>
            <p className="text-sm text-slate-600 mb-6">
              This appointment was cancelled. If you cancelled by mistake, please call us to rebook.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href={`/book/${props.orgSlug}/${props.bookingSlug}`}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 text-white px-4 h-11 text-sm font-semibold hover:bg-slate-800 transition-colors"
              >
                Book a new appointment
                <ArrowRight className="size-4" />
              </Link>
              {props.businessPhone ? (
                <a
                  href={`tel:${props.businessPhone.replace(/[^\d+]/g, "")}`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 text-slate-700 px-4 h-11 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  <Phone className="size-4" />
                  Call {props.businessPhone}
                </a>
              ) : null}
            </div>
          </div>
        ) : (
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-medium mb-4">
              <CheckCircle2 className="size-3.5" />
              Confirmed
            </div>
            <h1 className="text-xl font-semibold text-slate-900 mb-1">{props.title}</h1>
            {props.fullName ? (
              <p className="text-sm text-slate-500 mb-6">For {props.fullName}</p>
            ) : null}

            <dl className="space-y-3 border-t border-slate-100 pt-5 mb-6">
              <div className="flex items-center gap-3">
                <Calendar className="size-4 text-slate-400 shrink-0" />
                <dd className="text-sm text-slate-900">{dateLabel}</dd>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="size-4 text-slate-400 shrink-0" />
                <dd className="text-sm text-slate-900">{timeLabel}</dd>
              </div>
            </dl>

            {error ? (
              <p className="text-xs text-rose-600 mb-3" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col gap-2">
              <Link
                href={`/book/${props.orgSlug}/${props.bookingSlug}`}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 text-white px-4 h-11 text-sm font-semibold hover:bg-slate-800 transition-colors"
              >
                Pick a different time
                <ArrowRight className="size-4" />
              </Link>
              <button
                type="button"
                onClick={handleCancel}
                disabled={pending}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 text-rose-700 px-4 h-11 text-sm font-medium hover:bg-rose-50 transition-colors disabled:opacity-60"
              >
                <XCircle className="size-4" />
                {pending ? "Cancelling..." : "Cancel this appointment"}
              </button>
              {props.businessPhone ? (
                <a
                  href={`tel:${props.businessPhone.replace(/[^\d+]/g, "")}`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg text-slate-500 px-4 h-9 text-xs font-medium hover:text-slate-700 transition-colors mt-1"
                >
                  <Phone className="size-3.5" />
                  Or call {props.businessPhone}
                </a>
              ) : null}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
