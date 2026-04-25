# Desert Cool HVAC — SLICE 9 worked example scenario

**Status:** Authored 2026-04-25 · SLICE 9 PR 1 C1.

This is the canonical scenario reference for SLICE 9. Engineering uses
it to scope archetypes + seed data; launch content uses it as the
"about this business" frame in the worked-example walkthrough.

---

## The business

**Desert Cool HVAC** — Phoenix, Arizona. Family-owned mid-size HVAC
contractor serving the Phoenix metro area since 2008.

- **Owner-operator:** Jordan Reyes (founded the business after 12 years
  as a service tech at a national chain)
- **Office staff:** 2 (dispatcher + customer service)
- **Field technicians:** 14 (mix of senior installers, journeyman
  service techs, and apprentices)
- **Service area:** Phoenix metro — primarily Maricopa County (Phoenix,
  Scottsdale, Tempe, Mesa, Chandler, Glendale, Peoria), 40-mile radius
- **Customer base:**
  - ~1,540 residential accounts (single-family homes, mostly suburban
    1990s-2010s construction)
  - ~260 light commercial accounts (small offices, retail, professional
    services — under 10,000 sqft)
- **Revenue mix:**
  - 60% maintenance + repair (twice-yearly tune-ups, emergency calls)
  - 30% new install + replacement (residential AC/furnace replacements,
    multi-day jobs)
  - 10% commercial service contracts (recurring monthly revenue)

## Operations rhythm

**Phoenix HVAC seasonality is extreme.** Summer demand is life-safety,
not convenience.

| Season | Months | Dominant work | Typical daily volume |
|---|---|---|---|
| Summer (peak) | May 15 - Sep 30 | Emergency AC repair (24/7 on-call rotation) | 30-60 calls/day |
| Pre-summer surge | Mar 15 - May 14 | Pre-season tune-ups; install-job surge for replacements | 20-40 calls/day |
| Mild | Oct 1 - Nov 14 | Fall maintenance; commercial scheduled work | 10-20 calls/day |
| Winter | Nov 15 - Feb 28 | Furnace work; install-job pipeline | 15-25 calls/day |
| Pre-spring | Mar 1 - Mar 14 | Pre-summer prep marketing; quoting season | 15-25 calls/day |

**SLA expectations:**
- Emergency AC repair, 110°F+ day: 4 hours from call to truck on-site
- Emergency AC repair, normal day: 8 hours
- Scheduled maintenance: same-week appointment availability
- Install jobs: 2-3 week lead time in shoulder seasons; 4-6 weeks in summer

## Brand voice

**Tone:** professional, warm, reassuring. Family-business feel — the
owner answers the phone himself in winter. Direct talk, no jargon
unless explaining a technical issue to the customer.

**Sample phrases:**
- "We'll get a tech out today."
- "Your unit's been working hard this summer. Let's get it tuned up
  before the worst hits."
- "I want to make sure you understand what we found."
- "We'll be back if anything's not right — just give us a call."

**Avoid:**
- "Cheap" (Desert Cool is mid-tier, not the bargain option)
- "Hustle" (family business; deliberate pace, not sales-grindy)
- "Limited time offer" (no fake urgency — Phoenix summer creates real
  urgency without manufactured scarcity)
- Emoji in customer-facing copy (the owner finds them unprofessional
  for HVAC; quick-action SMS is OK with minimal use)

## Visual identity

**Color palette** (drives `organizations.theme`):
- **Primary:** `#dc2626` (red — heat, urgency, emergency response)
- **Accent:** `#0891b2` (cyan — cooling, relief, the product they sell)
- **Mode:** light (technicians use phones in bright Arizona sun;
  dark-mode dashboards are unreadable mid-July at noon)
- **Font:** Outfit (modern sans, conveys reliability without being
  too corporate)
- **Border radius:** rounded (warmer than sharp; less playful than
  pill)
- **Logo:** simple wordmark (SVG fixture in seed)

## Customer relationship model

Every customer record carries:
- Standard contact fields (name, phone, email, address)
- **Equipment list** — every HVAC unit installed (AC condenser,
  air handler, furnace, mini-split, etc.) with install date, brand,
  model, serial number, warranty expiration
- **Service history** — every service call (date, technician, work
  performed, parts used, cost)
- **Tier** — residential / commercial / vip-commercial (the
  vip-commercial tier carries SLA guarantees + first-call routing)
- **Emergency status** — on-call flag + last emergency timestamp
  (drives prioritization in the emergency triage workflow)

## Technicians (Soul-attribute, not block)

Per gate G-9-1 revised: technicians live as Soul records, not as a
dedicated block. Schema in `packages/crm/src/lib/soul/templates/
hvac-arizona.ts`.

Each technician:
- name, employee_id, hire_date
- skill_level: apprentice / journeyman / senior / master
- certifications: array of strings (NATE, EPA 608, etc.)
- service_area: array of zip codes (which neighborhoods they cover)
- on_call_today: boolean flag (operator updates daily)
- current_assignment: nullable service_call_id

For SLICE 9 PR 1, technicians are seeded as 14 records inline in
`seed-hvac-arizona.ts`. Future operator-facing UI for managing
technicians is post-launch (deliberately deferred).

## Operations the agent automates

The 4 archetypes in SLICE 9 PR 1 (2) + PR 2 (2):

1. **Pre-season maintenance campaign** (PR 1) — every March 1, scan
   customers whose last service was >6 months ago AND tier is
   residential, batch SMS outreach offering tune-up booking
2. **Emergency service triage** (PR 1) — customer texts "EMERGENCY"
   to the workspace number; check current weather (heat advisory?);
   route based on customer tier; SMS confirmation with ETA; escalate
   to dispatcher if no reply
3. **Heat advisory proactive outreach** (PR 2) — daily 5am: check NWS
   Phoenix forecast; if 110°F+ predicted; query Soul for vulnerable
   customers (elderly tier OR equipment >12 years OR no recent
   service); cascade SMS offering free pre-failure check
4. **Post-service follow-up** (PR 2) — subscription on
   `payment.completed`; wait 24h; SMS "How was your service?";
   branch on rating; high → review request; low → support escalation

All 4 demonstrate primitive composition without exotic dependencies.
None require new architectural primitives.

## Why this scenario for the capstone

- **Real-stakes seasonality:** Phoenix summer AC failure is a genuine
  emergency; the agent decisions (escalation, prioritization, ETA
  promises) carry real consequences. Tests that the platform can
  handle high-stakes domains.
- **Realistic ICP:** 14-tech mid-SMB is the platform's sweet spot.
  Not a Fortune 500; not a solo operator. The exact customer
  SeldonFrame's positioning targets.
- **Rich primitive workout:** every SLICE 5/6/7/8 primitive has an
  obvious, non-contrived use case. Demonstrates the primitive-first
  thesis without artificial scenarios.
- **Differentiated:** every agent-platform demo is "Slack bot" or
  "appointment scheduler". HVAC contractor in Phoenix is a real
  business with real economics — not a tech demo.

## Out of scope for SLICE 9

- Multi-region operations (Desert Cool is Phoenix-only; multi-region
  is a future scenario)
- Inventory management (parts tracking is its own domain)
- Payroll / commission tracking (out of CRM scope)
- Quoting / estimate generation (would require a separate quote-
  builder block)
- Fleet management (truck routing optimization is its own domain)

These are all real HVAC operations problems. SLICE 9's purpose is to
demonstrate the SeldonFrame platform's primitives composing into a
realistic vertical, not to build a complete HVAC SaaS.
