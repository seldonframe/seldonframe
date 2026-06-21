// Voice R1 — pure contact-resolution decision for public bookings.
//
// A booking can arrive with an email (web booking + text chatbot ALWAYS send
// one) or with only a phone (voice receptionist for a plumber/HVAC workspace
// that collects phone + address + service, no email). This helper decides how
// submitPublicBookingAction should match/create the contact, and what to store
// in the nullable email column.
//
// Kept pure (no DB, no Date) so the branch is unit-testable without Postgres —
// per the repo's DI-over-mocking convention. `actions.ts` is a "use server"
// file and may only export async functions, so this synchronous helper lives
// in its own module.

export type BookingContactIdentity = {
  /** How to resolve the contact row.
   *  - "email" — match/create by (orgId, email). Web + chatbot path.
   *  - "phone" — match/create by (orgId, phone). Voice no-email path.
   *  - "none"  — no contact method at all; caller falls back to an orphan
   *              booking (contactId null). */
  matchBy: "email" | "phone" | "none";
  /** Trimmed email when present, else null. */
  email: string | null;
  /** Trimmed phone when present, else null. */
  phone: string | null;
  /** The value to write to the nullable email columns (booking + contact):
   *  the trimmed email when present, otherwise null (never ""). */
  storedEmail: string | null;
};

function nonEmpty(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Decide how to resolve the booking's contact from the (email, phone) it
 * arrived with. Email wins when present (preserves the historical web/chatbot
 * behavior byte-for-byte); otherwise we key off phone; otherwise "none".
 */
export function resolveBookingContactIdentity(input: {
  email?: string | null;
  phone?: string | null;
}): BookingContactIdentity {
  const email = nonEmpty(input.email);
  const phone = nonEmpty(input.phone);

  if (email) {
    return { matchBy: "email", email, phone, storedEmail: email };
  }
  if (phone) {
    return { matchBy: "phone", email: null, phone, storedEmail: null };
  }
  return { matchBy: "none", email: null, phone: null, storedEmail: null };
}
