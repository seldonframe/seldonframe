---
name: intake
version: 1.0.0
description: The intake form (the lead-capture page at /intake). Title, description, and the questions visitors answer. Per-vertical — a barbershop intake is short, a legal intake is structured, a coaching intake is exploratory.
section_type: intake
props:
  title:
    type: string
    required: true
    min_words: 2
    max_words: 8
    description: Form title shown at the top of the page. Vertical-specific. NOT "Tell us about your project" or "Get in touch" — those are template defaults.
  description:
    type: string
    required: false
    max_words: 30
    description: Optional 1-sentence framing under the title. What the visitor is signing up for, how long it takes, what happens next.
  questions:
    type: array
    required: true
    min_items: 3
    max_items: 8
    description: |
      The actual questions. Order matters - ask easy/identifying questions first (name, email), THEN scope-defining questions, THEN open-ended at the end. Don't ask for budget or sensitive info before establishing context.
    item_schema:
      id: { type: string, description: "snake_case id, unique within the form" }
      label: { type: string, description: "Customer-facing question phrasing" }
      type: { type: string, enum: ["text", "textarea", "email", "phone", "number", "select", "multi-select", "rating", "date"] }
      required: { type: boolean }
      helper: { type: string, required: false, description: "Optional one-line clarifier under the label" }
      options: { type: array, items: { type: string }, required: false, description: "for type=select / multi-select" }
  completion_headline:
    type: string
    required: true
    min_words: 2
    max_words: 8
    description: What the user sees AFTER they submit. e.g. "Thanks - we'll be in touch", "We got it!". Personal, not corporate.
  completion_message:
    type: string
    required: false
    max_words: 30
    description: Optional 1-sentence message after submission. What happens next, when to expect a reply.
validators:
  - rule: title_not_generic
    severity: error
    description: title must NOT be "Tell us about your project", "Get in touch", "Contact us", "Inquiry form", "Submit your details". Restate as something specific to this business.
  - rule: has_email_field
    severity: error
    description: At least one question must have type="email". Forms without email collection are useless to operators.
  - rule: question_ids_unique
    severity: error
    description: Every question.id must be unique. Duplicates cause submission data overwrites.
  - rule: select_options_present
    severity: error
    description: For every type=select / multi-select question, options array must have ≥2 entries.
  - rule: not_too_long
    severity: warn
    description: Forms with >6 questions have measurably worse completion rates. If you have 7-8 questions, you'd better be confident every one earns its place.
---

# Intake Block — generation prompt

You are configuring the intake form. The intake is where the visitor
who's INTERESTED but not READY-TO-BOOK leaves their info. v1's hardcoded
default ("Tell us about your project") leaked into every workspace — and
made every vertical's intake feel identical. v2's job is to write an
intake form that feels written FOR THIS BUSINESS.

## The mental model

The intake form is a conversation, not a database insert. Each question
asks: *"Will the answer change what we do for this person?"* If no, drop it.

Order matters. Start with low-stakes identifying questions (name, email),
then scope (what service, what timeframe), then open-ended at the end
(anything else?). Don't ask for budget, address, or sensitive info before
establishing trust.

Length matters. 3-5 questions = healthy completion. 6+ = friction.

## Voice rules

1. **Title names what the form actually is.** "Get a Quote" if it's a
   quote request. "Request a Consultation" if it's that. NOT "Get in touch."
2. **Questions in the visitor's voice.** "Tell us about your dog" not
   "Provide pet information". "What kind of cut are you thinking?" not
   "Service preference".
3. **Required fields earn it.** Mark a field required only if you
   GENUINELY can't proceed without it. Optional fields with helper text
   often outperform forced ones.
4. **Select options match real choices.** If the operator's services are
   "AC repair / Heating / Duct cleaning", those are the select options.
   Don't invent generic categories.
5. **Completion headline is human.** "Thanks — we'll get back to you
   today" beats "Submission received."

## Worked examples

### Mobile dog grooming

```json
{
  "title": "Tell Us About Your Dog",
  "description": "Quick form so we know what to bring to your appointment. Takes about 60 seconds.",
  "questions": [
    { "id": "owner_name", "label": "Your name", "type": "text", "required": true },
    { "id": "email", "label": "Email", "type": "email", "required": true },
    { "id": "phone", "label": "Phone (text-friendly)", "type": "phone", "required": true },
    { "id": "dog_name", "label": "Your dog's name", "type": "text", "required": true },
    { "id": "dog_breed", "label": "Breed (or best guess for mixes)", "type": "text", "required": true },
    { "id": "service", "label": "What's the main thing they need?", "type": "select", "required": true, "options": ["Full-service grooming", "Bath & brush", "Nail trim only", "De-shedding treatment", "Puppy first groom", "Not sure — recommend something"] },
    { "id": "notes", "label": "Anything we should know?", "type": "textarea", "required": false, "helper": "Anxiety, sensitivities, prior bad experiences — all helpful." }
  ],
  "completion_headline": "Thanks — we'll text you within the hour",
  "completion_message": "We'll confirm a time and a quote based on your dog's coat. Same-day grooming often available."
}
```

### HVAC

```json
{
  "title": "Request Service or a Free Estimate",
  "description": "Two minutes, no obligation. We'll call back within an hour during business hours.",
  "questions": [
    { "id": "name", "label": "Your name", "type": "text", "required": true },
    { "id": "email", "label": "Email", "type": "email", "required": true },
    { "id": "phone", "label": "Best phone", "type": "phone", "required": true },
    { "id": "service_address", "label": "Service address", "type": "text", "required": true, "helper": "So we can confirm we serve your area." },
    { "id": "service_type", "label": "What do you need?", "type": "select", "required": true, "options": ["Emergency repair", "Scheduled repair", "New install / replacement", "Maintenance / tune-up", "Free estimate", "Not sure"] },
    { "id": "equipment", "label": "Equipment", "type": "select", "required": false, "options": ["Central AC", "Furnace", "Heat pump", "Ductless mini-split", "Water heater", "Other / not sure"] },
    { "id": "issue", "label": "What's the issue?", "type": "textarea", "required": false }
  ],
  "completion_headline": "Got it — we'll call within the hour",
  "completion_message": "If it's after-hours we'll respond first thing tomorrow. For true emergencies call (480) 555-2100."
}
```

### Legal

```json
{
  "title": "Tell Us Your Situation",
  "description": "Confidential. We'll review and reach out within one business day to schedule a free 30-minute consult.",
  "questions": [
    { "id": "name", "label": "Your name", "type": "text", "required": true },
    { "id": "email", "label": "Email", "type": "email", "required": true },
    { "id": "phone", "label": "Phone (we won't call without permission)", "type": "phone", "required": true },
    { "id": "matter_type", "label": "What kind of matter?", "type": "select", "required": true, "options": ["Divorce", "Custody / Parenting", "Mediation", "Estate planning", "Other family law", "Not sure"] },
    { "id": "summary", "label": "Briefly, what's going on?", "type": "textarea", "required": true, "helper": "A few sentences is plenty. We'll ask follow-ups at the consult." },
    { "id": "urgency", "label": "How urgent?", "type": "select", "required": false, "options": ["This week", "This month", "Just exploring options"] }
  ],
  "completion_headline": "Thanks — we'll be in touch tomorrow",
  "completion_message": "Sarah will personally review and reply within one business day. Everything you wrote is confidential."
}
```

### Coaching

```json
{
  "title": "Take the Fit Quiz",
  "description": "Five questions. Helps us figure out whether coaching is the right move for where you are right now.",
  "questions": [
    { "id": "name", "label": "Your name", "type": "text", "required": true },
    { "id": "email", "label": "Email", "type": "email", "required": true },
    { "id": "current_role", "label": "Where are you now?", "type": "text", "required": true, "helper": "Title + industry is plenty." },
    { "id": "goal", "label": "What change are you trying to make?", "type": "textarea", "required": true },
    { "id": "timeline", "label": "Timeline?", "type": "select", "required": true, "options": ["Already in motion", "Next 3 months", "Next 6-12 months", "Just exploring"] },
    { "id": "tried_before", "label": "Worked with a coach before?", "type": "select", "required": false, "options": ["Yes, was great", "Yes, wasn't a fit", "No, first time"] }
  ],
  "completion_headline": "Got it — give me 24 hours",
  "completion_message": "I'll read through and reply with whether I think we're a fit. If not I'll point you somewhere better."
}
```

## Output format

Return ONLY a single JSON object matching the props schema. No prose, no
markdown fences.

If the operator gave you minimal context, default to a 4-question form
(name + email + phone + one open-ended "what do you need?"). Adding more
questions without a clear reason hurts completion. Less is almost always
more here.
