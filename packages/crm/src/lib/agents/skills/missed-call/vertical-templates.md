# Missed-Call-Text-Back skill pack — vertical templates

This skill pack is read by the synthesis engine when filling the
`$textBackBody` placeholder of the `missed-call-text-back` archetype.
The archetype harness is vertical-agnostic; the per-vertical
*intelligence* lives here in markdown the LLM reads at runtime.

When the LLM gets better, the synthesized text-back gets better.
This file doesn't need to change.

## How the synthesis engine uses this pack

1. The agency invokes `missed-call-text-back` for a workspace whose
   Soul has `vertical: "hvac"` (or plumbing, dental, salon, etc.).
2. Synthesis reads this pack, finds the section matching the Soul's
   vertical, and uses the guidance in that section to fill the
   `$textBackBody` placeholder.
3. The filled SMS body ships into the agent spec and runs at
   call.missed time.

If the Soul's vertical doesn't match any section here, synthesis
falls back to the **Default (generic)** section at the bottom. Add
new verticals by writing a new section — no code change.

## Style rules across all verticals

These hold regardless of vertical. They are the constraints the
synthesized text-back must respect.

- **Under 200 characters.** SMS segments are 160 chars (GSM-7) or
  70 chars (UCS-2). Two-segment messages cost 2x and arrive as
  separate notifications. Single-segment under 160 wins.
- **Name the business in the first 30 chars.** The caller doesn't
  remember which number they just dialed. "Hey, this is Acme HVAC"
  is the right opening; "Hey there!" is wrong.
- **One question, never two.** Multi-question texts get partial
  answers or no answer. Ask the single most useful qualifying
  question for the vertical.
- **No emojis.** Local-service customers skew older + on flip-phones
  or low-vision settings; emoji rendering is unreliable across
  carriers. The agency can override per-client if they want.
- **No links unless adding genuine value.** A booking link sounds
  helpful but converts worse than a conversational reply that
  qualifies first, then offers the booking link as the follow-up.
- **No "press 1 for ..."** SMS isn't IVR. Plain-language reply is
  the entire interaction model.
- **Reference {{businessName}} for the business name** so the
  filled SMS is portable across the agency's clients.

## HVAC

The caller's most urgent qualifying question is **emergency vs
routine**. Emergencies (no AC in summer, no heat in winter, gas
leak suspicion, water leak from system) command premium pricing
and dispatch priority. Routine service (annual maintenance, filter
change, quote on replacement system) goes to the regular queue.

Pattern:
> "Hey, this is {{businessName}} — sorry we missed your call! Is
> this an emergency (no AC, no heat, leak) or a scheduled service?
> Reply and we'll get you sorted."

Tone calibration based on Soul:
- High-urgency Soul (24/7 emergency-positioned businesses): drop
  "sorry we missed your call" — too apologetic for an emergency
  service. Lead with "Is this an emergency?"
- Family-business Soul: warmer opening ("Hey, this is the team at
  {{businessName}}"), same single question.

## Plumbing

Same emergency-vs-routine split as HVAC, but the failure modes are
different. Burst pipes and sewer backups are highest-urgency.
Slow drains and quote-on-replacement are routine.

Pattern:
> "Hey, this is {{businessName}} — sorry we missed your call! Is
> this an emergency (burst pipe, backup, no water) or a scheduled
> service? Quick reply and we'll dispatch."

## Roofing

Lower urgency than HVAC/plumbing for most callers. The two real
qualifying paths are **storm damage** (insurance claim work; high
margin; time-sensitive) and **roof inspection or estimate** (low-
urgency, scheduled). Active leak is the rare emergency case.

Pattern:
> "Hey, this is {{businessName}} — sorry we missed your call! Are
> you dealing with active leak / storm damage, or wanting an estimate?
> Quick reply and we'll get you scheduled."

## Electrical

Emergencies are sparking, smell of burning, or full outage in part
of the house. Routine is panel upgrades, ceiling fan installs,
adding outlets. The qualifying question filters on safety risk.

Pattern:
> "Hey, this is {{businessName}} — sorry we missed your call! Is
> this an emergency (sparking, burning smell, outage) or a planned
> install? Reply and we'll get a tech out."

## Dental

Different qualifying axis: **insurance acceptance** is the #1
caller blocker. Asking insurance carrier upfront filters out-of-
network callers before the front desk wastes time on the callback.

Pattern:
> "Hi, this is {{businessName}} — sorry we missed your call. Quick
> question: do you have insurance? Reply with your provider name
> or 'none' and we'll get you a callback with availability."

For emergency-positioned dental Souls (24/7 emergency dental
services), use HVAC-style emergency-vs-routine framing instead:
> "Hi, this is {{businessName}} — sorry we missed your call. Is
> this a dental emergency (broken tooth, severe pain, swelling) or
> a scheduled appointment? Quick reply and we'll get you sorted."

## Chiropractic / Physical Therapy

Insurance + new vs returning patient is the qualifying split.

Pattern:
> "Hi, this is {{businessName}} — sorry we missed your call! Are
> you a new or returning patient, and do you have insurance? We'll
> get you on the schedule."

## Salon / Beauty / Spa

Qualifying axis is **service type + stylist preference**. Caller
may be booking a haircut vs color vs treatment, and they often
prefer a specific stylist.

Pattern:
> "Hi, this is {{businessName}} — sorry we missed your call! What
> service were you looking for, and do you have a stylist preference?
> Reply and we'll get you booked."

## Medspa

Higher-end positioning; qualifying axis is **specific treatment
interest**. Botox, fillers, laser, IPL, body contouring are
different consultation paths.

Pattern:
> "Hi, this is {{businessName}} — sorry we missed your call! What
> treatment were you interested in (Botox, filler, laser, body
> contouring, other)? Reply and we'll schedule a consult."

## Real Estate

Qualifying axis is **buying vs selling vs renting** + **timeline**.
First-time buyer at the discovery stage gets different routing
than a relocating-in-30-days seller.

Pattern:
> "Hi, this is {{businessName}} — sorry I missed your call! Are
> you looking to buy, sell, or rent, and what's your timeline?
> Quick reply and I'll get you the right info."

Note the "I" — solo real estate agents prefer first-person; the
Soul should signal this. Agency Souls use "we".

## Locksmith

24/7 emergency service; the qualifying question is **location
type** (residential / commercial / automotive lockout). Each has
different rate cards + dispatch logic.

Pattern:
> "Hey, this is {{businessName}} — sorry we missed your call! Is
> this a house, business, or car lockout? Reply with your location
> and we'll dispatch the closest tech."

## Photography

Qualifying axis is **event type + date**. Wedding, family portrait,
corporate headshot, real estate, product all have different rate
cards. Date filters availability fast.

Pattern:
> "Hi, this is {{businessName}} — sorry I missed your call! What
> kind of shoot are you planning (wedding, portrait, corporate,
> real estate, product) and what date are you thinking? I'll get
> you a quick quote."

## Default (generic)

Fallback when the Soul's vertical isn't represented above. Keep
the qualifying question maximally open so the operator can route
manually.

Pattern:
> "Hey, this is {{businessName}} — sorry we missed your call! What
> can we help you with? Reply and we'll get back to you shortly."

## Adding a new vertical

1. Add a new section to this file with the vertical's qualifying
   axis named explicitly + the pattern SMS.
2. The synthesis engine picks up the new section on next run; no
   code change required.
3. Document any Soul-driven tone calibrations (urgency-positioned
   vs family-business vs premium-positioned).
4. The 200-char + single-question + no-emoji constraints from the
   global style rules apply to every new vertical.

## Anti-patterns to avoid

- ❌ "Please leave a message" — that's voicemail, not a text-back.
  The whole point is to skip voicemail with a faster medium.
- ❌ Two questions in one SMS ("Is this an emergency? And what's
  your name?") — partial-answer rates are high; ask one thing.
- ❌ Generic greeting with no business name ("Hey! Sorry we missed
  you!") — caller doesn't remember which number they just dialed.
- ❌ Booking link as the primary CTA on the first text-back. The
  caller hasn't even told you what they need yet; a booking link
  feels presumptuous. Save the link for the qualifying-reply
  follow-up.
- ❌ "Press 1 for ..." — this is SMS, not IVR.
- ❌ Apologetic-to-the-point-of-weakness language ("So sorry for
  missing your call, please forgive us") — undermines the
  business's authority and tone.
