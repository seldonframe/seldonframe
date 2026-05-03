---
name: booking
version: 1.0.0
description: The booking page (calendar) — what visitors see when they hit /book. Title, description, slot duration, location kind, weekly availability hours, and the form fields collected at booking time.
section_type: booking
props:
  title:
    type: string
    required: true
    min_words: 2
    max_words: 8
    description: Event-type title in the calendar header. Vertical-specific. e.g. "Book Your Haircut", "Schedule HVAC Service", "Book a Consultation". NEVER "Free consultation" or "30-minute conversation" — those are the v1 template defaults that leaked.
  description:
    type: string
    required: true
    min_words: 12
    max_words: 50
    description: 1-2 sentences shown under the title. Tells the visitor what happens at the appointment + any prep needed. Customer-facing, not internal jargon.
  duration_minutes:
    type: number
    required: true
    description: Default slot length in minutes. Pick based on the actual service - 30 for quick consults / nail trims, 45 for haircuts / coaching sessions, 60 for treatments / strategy calls / HVAC service calls, 90 for premium grooming / legal consults.
  location_kind:
    type: string
    required: true
    enum: ["on-site-business", "on-site-customer", "phone", "video", "hybrid"]
    description: |
      Where the appointment happens.
      - "on-site-business": customer comes to the business (barbershop, dental office, salon, restaurant, retail, gym).
      - "on-site-customer": provider goes to the customer (HVAC, plumber, landscaping, mobile groomer, in-home tutor).
      - "phone": voice consultation (legal intake, basic coaching).
      - "video": Zoom/Meet/Teams (agency, remote coaching, telehealth).
      - "hybrid": mix of in-person and remote.
  weekly_availability:
    type: object
    required: true
    description: |
      Per-weekday availability. Each weekday key (mon, tue, wed, thu, fri, sat, sun) is either an [openHour, closeHour] tuple or null (closed that day). Hours are 0-24 in workspace timezone. Pick hours that match the vertical - HVAC 7-19, dental 8-17, restaurant 11-22, mobile services 9-18, legal 9-17.
    properties:
      mon: { type: array, items: { type: number }, description: "[openHour, closeHour] or null" }
      tue: { type: array, items: { type: number } }
      wed: { type: array, items: { type: number } }
      thu: { type: array, items: { type: number } }
      fri: { type: array, items: { type: number } }
      sat: { type: array, items: { type: number } }
      sun: { type: array, items: { type: number } }
  form_fields:
    type: array
    required: false
    description: |
      Optional extra fields collected on the booking form (ABOVE the standard name + email). Only include if the vertical genuinely needs them ("Dog's name" for grooming, "Service address" for HVAC, "What you'd like to discuss" for legal). Omit entirely for simple bookings.
    item_schema:
      id: { type: string, description: "snake_case id, e.g. 'dog_name', 'service_address'" }
      label: { type: string, description: "Customer-facing label" }
      type: { type: string, enum: ["text", "email", "phone", "textarea", "select"] }
      required: { type: boolean }
      placeholder: { type: string, required: false }
      options: { type: array, items: { type: string }, required: false, description: "for type=select only" }
validators:
  - rule: title_not_generic
    severity: error
    description: title must NOT be "Free consultation", "30-minute conversation", "Discovery call", "Schedule a meeting", or "Book a meeting". Restate as the vertical's actual primary appointment.
  - rule: duration_reasonable
    severity: error
    description: duration_minutes must be in [15, 240]. Out-of-range values break the slot generator.
  - rule: at_least_one_open_day
    severity: error
    description: weekly_availability must have at least one weekday with non-null hours. A booking page with zero open days is broken by definition.
  - rule: hours_sane
    severity: error
    description: For each open day, openHour < closeHour, both in [0, 24], and the window is at least 1 hour wide. No reverse hours, no zero-width windows.
---

# Booking Block — generation prompt

You are configuring the booking page (the calendar visitors hit at /book).
v1's hardcoded defaults leaked "Free consultation / 30-minute conversation"
into every workspace whose vertical wasn't in the curated list. v2's job
is to produce booking metadata that matches the actual primary appointment
of THIS business.

## The mental model

The booking page is where intent becomes commitment. The visitor scrolled
through the hero, the services, the FAQ — and clicked "Book". They expect
the calendar to confirm:

> "Yes, this is the right place to book the thing I came here for."

A grooming customer expects "Book Your Dog's Mobile Grooming". A legal
customer expects "Book a Free 30-Minute Consultation". A barbershop
customer expects "Book Your Cut". The title alone, before they pick a
date, has to feel right.

## Voice rules

1. **Title names the actual appointment.** Match what the visitor came to
   book. NOT "Free consultation" unless that IS the appointment.
2. **Duration matches the vertical.** Don't put 30 minutes for a 90-minute
   grooming. Don't put 60 minutes for a 15-minute nail trim.
3. **Location kind is structural, not stylistic.** Pick the real one based
   on how the business operates. HVAC = on-site-customer. Barbershop =
   on-site-business. Coach = video unless they specifically meet in person.
4. **Availability matches the trade.** A bar opens at 4pm. A mobile
   groomer works 9-6. An HVAC tech is on-call 7am-7pm. Pick believable
   hours; skipping days is fine ("Closed Sunday").
5. **Form fields are minimal.** Standard name + email are added by the
   renderer automatically. Add extra fields only when the appointment
   genuinely needs them.

## Worked examples

### Mobile dog grooming

```json
{
  "title": "Book Your Dog's Mobile Grooming",
  "description": "Pick a slot and we'll come to your driveway in our converted van. One dog at a time, no kennels, no waiting. Please confirm your dog's size and coat type so we can plan the visit.",
  "duration_minutes": 90,
  "location_kind": "on-site-customer",
  "weekly_availability": {
    "mon": [9, 18],
    "tue": [9, 18],
    "wed": [9, 18],
    "thu": [9, 18],
    "fri": [9, 18],
    "sat": [9, 16],
    "sun": null
  },
  "form_fields": [
    { "id": "dog_name", "label": "Your dog's name", "type": "text", "required": true },
    { "id": "dog_breed", "label": "Breed", "type": "text", "required": true, "placeholder": "e.g. Goldendoodle, Mixed" },
    { "id": "service_address", "label": "Service address", "type": "text", "required": true },
    { "id": "notes", "label": "Anything we should know? (anxiety, sensitivities, etc.)", "type": "textarea", "required": false }
  ]
}
```

### HVAC

```json
{
  "title": "Schedule HVAC Service",
  "description": "Pick a 60-minute window and we'll dispatch a technician. Same-day available for emergencies. Please confirm the equipment type so we arrive with the right parts.",
  "duration_minutes": 60,
  "location_kind": "on-site-customer",
  "weekly_availability": {
    "mon": [7, 19], "tue": [7, 19], "wed": [7, 19], "thu": [7, 19], "fri": [7, 19],
    "sat": [8, 16],
    "sun": null
  },
  "form_fields": [
    { "id": "service_address", "label": "Service address", "type": "text", "required": true },
    { "id": "equipment_type", "label": "Equipment", "type": "select", "required": true, "options": ["Central AC", "Furnace", "Ductless mini-split", "Heat pump", "Water heater", "Other"] },
    { "id": "issue", "label": "What's going on?", "type": "textarea", "required": false }
  ]
}
```

### Legal (consultative)

```json
{
  "title": "Book a Free Consultation",
  "description": "30 minutes, in person at our Vancouver office or by phone. We'll listen, give you our honest read on your options, and tell you whether we're the right fit. No obligation either way.",
  "duration_minutes": 30,
  "location_kind": "hybrid",
  "weekly_availability": {
    "mon": [9, 17], "tue": [9, 17], "wed": [9, 17], "thu": [9, 17], "fri": [9, 17],
    "sat": null, "sun": null
  },
  "form_fields": [
    { "id": "matter_type", "label": "Type of matter", "type": "select", "required": true, "options": ["Divorce", "Custody / Parenting", "Mediation", "Estate planning", "Other"] },
    { "id": "preferred_format", "label": "Preferred format", "type": "select", "required": true, "options": ["In-person at our office", "Phone"] },
    { "id": "summary", "label": "Briefly, what's the situation?", "type": "textarea", "required": false }
  ]
}
```

### Barbershop

```json
{
  "title": "Book Your Cut",
  "description": "Pick a time, walk in, sit down. Standard cuts run 30 minutes; combo cut + beard runs 60. If you're a first-timer, mention what you're going for in the notes.",
  "duration_minutes": 30,
  "location_kind": "on-site-business",
  "weekly_availability": {
    "mon": null,
    "tue": [10, 19], "wed": [10, 19], "thu": [10, 19], "fri": [10, 19],
    "sat": [9, 17],
    "sun": [10, 16]
  },
  "form_fields": [
    { "id": "service", "label": "What service?", "type": "select", "required": true, "options": ["Haircut", "Beard trim", "Cut + beard combo", "Kids cut"] },
    { "id": "notes", "label": "Anything we should know?", "type": "textarea", "required": false }
  ]
}
```

## Output format

Return ONLY a single JSON object matching the props schema. No prose, no
markdown fences. The persistence endpoint runs `JSON.parse` directly.

If the operator gave you minimal context (no service hours, no clear
primary service), default to weekday business hours (mon-fri, 9-17) and
pick the duration that matches the OBVIOUS primary service from the
business description. Don't invent extra form fields just to fill space —
omit `form_fields` entirely if name + email is sufficient.
