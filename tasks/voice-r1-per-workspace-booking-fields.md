# Voice R1 — per-workspace booking fields (feature/voice-r1)

Make the AI voice receptionist collect the booking fields each WORKSPACE
declares in its appointment-type `intakeFields`, instead of hardcoding
name+email. Strict TDD: failing test first, watch fail, minimal impl, watch pass.

## A. book_appointment — email optional + phone/intakeResponses passthrough
- [x] A0 Update existing realtime-tools.spec assertion (required no longer includes email)
- [x] A1 (test) bookAppointmentInput: email optional; intakeResponses record; refine email|phone
- [x] A2 (test) jsonSchema required = [fullName, slotIso]; intakeResponses object documented
- [x] A3 (test) execute passes phone + intakeResponses through; phone folded into intakeResponses.phone
- [x] A4 (test) neither email nor phone → validation fails
- [x] A5 Add BookAppointmentDeps (DI submit fn) mirroring RescheduleDeps; keep confirmed gate intact
- [x] A6 Implement until green

## B. submitPublicBookingAction — resolve contact by phone when email absent
- [x] B1 (test) extract pure helper resolveBookingContactIdentity({email, phone}) — keys by email when present, phone when absent
- [x] B2 email optional in param type; null (not "") stored when absent
- [x] B3 email present → byte-for-byte identical (web + chatbot unaffected) — verified: both call sites trim email before send
- [x] B4 email absent → match/create contact by (orgId, phone); contact.email=null
- [x] B5 No NOT NULL violation; email/SMS via booking.created event (verified — nothing to guard inline); paid-booking checkout passes "" for Stripe
- [x] B6 Implement until green

## C. Voice persona — inject workspace's required booking fields
- [x] C1 (test) composeVoicePersona(intakeFields=[...]) emits a deterministic "To book, collect: ..." line, marks required
- [x] C2 (test) empty intakeFields → falls back to "collect full name and email"
- [x] C3 composeVoicePersona stays pure (intakeFields passed as arg) + composeBookingFieldsInstruction extracted pure
- [x] C4 loadVoicePersonaInputs loads appointment-type intakeFields (status=template, metadata.kind=appointment_type) via injectable dep; selectAppointmentIntakeFields pure helper; wired into webhook route
- [x] C5 Implement until green

## Verify
- [x] tsc --noEmit (packages/crm) green
- [x] All touched specs green (82/82)
- [x] Full unit suite: fail count unchanged at 77 (all pre-existing on ca37874d) — ZERO regressions
- [ ] Commit on feature/voice-r1 (no merge/push/deploy)

## Review
- Files changed (impl): tools.ts, bookings/actions.ts, bookings/contact-identity.ts (NEW),
  agents/voice/persona.ts, agents/voice/voice-workspace.ts, api/v1/voice/openai/webhook/route.ts.
- Files changed (tests): voice-r1-tools.spec.ts, realtime-tools.spec.ts, voice-persona.spec.ts,
  voice-workspace.spec.ts, bookings/contact-identity.spec.ts (NEW).
- No-email contact resolution: pure resolveBookingContactIdentity({email,phone}) decides matchBy
  email|phone|none + storedEmail (null when no email). submitPublicBookingAction builds the
  (orgId,email|phone) predicate from it, stores null (never "") in the nullable email columns.
  Email-present path is byte-for-byte equivalent (email trimmed, same as both existing callers).
- Persona injection: loadVoicePersonaInputs gains a DI seam; default loads all status='template'
  rows and selectAppointmentIntakeFields picks the first appointment_type template's intakeFields.
  composeVoicePersona takes intakeFields and emits a deterministic "To book, collect…" block via
  the pure composeBookingFieldsInstruction (required/optional marked, ids enumerated for
  intakeResponses). Empty/missing → name+email fallback. Best-effort: a loader throw → [] → fallback.
- Pre-existing brittle test to flag: tests/unit/workflow-event-log/category-server-actions.spec.ts
  asserts emit-site orgId at HARDCODED line numbers in bookings/actions.ts (894/1001 etc). Already
  red on baseline; my +imports/+block shift those lines further. Not a regression (count stays 77)
  but the controller may want to refresh those line numbers when this lands.

## Notes / findings
- contacts.email, contacts.phone, bookings.email, bookings.fullName are ALL nullable.
- createBookingForCustomer already accepts email: string | null — passing null works natively.
- NO inline confirmation email inside submitPublicBookingAction — it fires emitSeldonEvent("booking.created"),
  and a downstream trigger picks channel (email if Resend, SMS if Twilio). Nothing to guard for null email there.
- Tests live in packages/crm/tests/unit/**, import source via RELATIVE paths, run via node --import tsx --test.
- EXISTING realtime-tools.spec.ts asserts required=[fullName,email,slotIso] — MUST update (contract change I own).
- BookingIntakeField {id,label,type,required?,placeholder?,options?,helpText?} exported from @/lib/bookings/actions.
