---
name: landing-page-creation
version: 1.0.0
description: |
  Build a SeldonFrame workspace's marketing landing page using the existing
  block primitives (get_block_skill + persist_block). Use when the operator
  asks to "build a landing page", "make a website", "design the home page",
  "redo the landing", or similar. Triggers AFTER workspace has been created
  via create_workspace_from_url (which by default creates only a chatbot-
  preview demo page — this skill replaces it with a marketing landing page).
when_to_use:
  - operator explicitly asks for a landing page
  - operator asks to redesign / refresh / regenerate the public site
  - operator asks to "show more than the chatbot demo"
  - operator wants a marketing surface for a client whose existing site is poor
when_not_to_use:
  - operator just created the workspace and hasn't asked for a landing page
    (the chatbot-preview is the intentional default — don't pre-generate)
  - operator wants to edit a single block (use customize_block instead)
  - operator wants a quiz funnel, intake form, or other non-landing block
---

# Landing-page creation

You are building a marketing landing page for a SeldonFrame workspace.
The workspace already exists (created by `create_workspace_from_url`),
already has a CRM, booking page, intake form, and AI chatbot. Today its
public surface is a chatbot-only preview page. The operator has asked
you to replace that with a full marketing landing.

## Mental model

SeldonFrame's pitch is **"ops stack first, marketing optional."** The
operator already has the ops stack live. A landing page is opt-in —
some clients have great existing sites and only need the chatbot+CRM
bolted on; others have outdated sites and want SF to render a new one.

When you build a landing page, the operator is in the second bucket.
Your job is to produce a page that's better than what their client
currently has — premium, niche-specific, archetype-correct.

## Process

### Step 1 — Understand the workspace

Call `get_workspace_state(workspace_id)` to load:
- The soul (business name, vertical, services, voice, certifications,
  reviews, emergency-service flag, same-day flag, business description)
- The classified `aesthetic_archetype` (one of 7: bold-urgency,
  clinical-trust, cinematic-aspirational, editorial-warm,
  technical-restrained, soft-residential, brutalist)
- The theme (palette, fonts) — already archetype-correct from v1.40
- Active integrations (so you don't reference an API the workspace
  doesn't have configured yet — e.g. don't promise SMS booking
  confirmations in copy if Twilio isn't connected)

If `aesthetic_archetype` is null (pre-v1.54 workspace), pick one
yourself from the vertical + business description, then proceed.

### Step 2 — Optionally consult external design skills

If the user has installed `claude-code/frontend-design/SKILL.md` (the
Anthropic frontend-design plugin), read it for Tailwind / Framer Motion
patterns and component composition guidance. It pairs with this skill:
frontend-design gives you the HOW (components, motion, layout); this
skill gives you the WHAT (which SF blocks, what order, what voice).

If `google-labs-code/design.md` is available, optionally invoke it for
design-language generation. It produces a design.md you can fold into
the block prompts as additional constraints.

### Step 3 — Decide the block sequence

Pick from available blocks. The default sequence for most service businesses:

1. `hero` — primary headline + CTA + supporting visual
2. `servicesGrid` — what they do (cards, pricing optional)
3. (optional) `projectGallery` — visual proof of work
4. (optional) `testimonials` — social proof
5. `faq` — top objections answered
6. (optional) `emergencyStrip` — only for bold-urgency archetypes
7. `cta` — closing call-to-action

#### Per-archetype adjustments

| archetype | adjustments |
|-----------|-------------|
| `bold-urgency` | add `emergencyStrip` after hero; skip `testimonials` if reviews < 50; add `stickyMobileCTA` for one-thumb booking |
| `clinical-trust` | add `benefits` block listing credentials; lengthen `faq` with insurance/financing questions; consider `process` block |
| `cinematic-aspirational` | lead with `projectGallery` immediately after hero; soften `faq` to "what to expect" tone |
| `editorial-warm` | longer `whoitsfor` / `process` blocks; more whitespace; skip emergencyStrip |
| `technical-restrained` | structured `features` block with bullet metrics; precise `pricing`; skip stickyMobileCTA |
| `soft-residential` | warm `benefits` block; visible `serviceArea` (zip codes covered); friendly `cta` |
| `brutalist` | minimal block count (hero + servicesGrid + cta); raw layouts, no soft easing |

### Step 4 — Generate and persist each block

For each block in the sequence:

a. Call `get_block_skill(block_name)` — returns the block's SKILL.md
   with its prop schema, voice rules, validators, and worked examples.

b. Generate props following the SKILL.md AND the archetype voice
   (`leanInto` / `avoid` lists from the archetype registry — accessed
   via the v1.54 `theme.aestheticArchetype` value).

c. Call `persist_block(workspace_id, block_name, prompt, props)` —
   v1.54's server enforcement WILL override your `template` and
   `variant` fields if they don't match the archetype's defaults. This
   is intentional — trust the server-side enforcement. Don't second-
   guess archetype defaults.

d. Note validator warnings in the response. If a validator flagged
   `headline_quantified`, `no_throat_clearing`, or similar, FIX YOUR
   PROPS AND CALL persist_block AGAIN. Don't ship past validators —
   they catch the patterns operators have explicitly told us look bad.

### Step 5 — Verify and report

After all blocks land:

a. Call `get_workspace_snapshot(workspace_id)` to confirm the landing
   page rendered (`landing_pages.sections` now has hero / services /
   etc instead of the original chatbot-preview).

b. Report the public URL back to the operator with a brief summary of
   what you placed and which archetype voice you used.

c. Offer concrete next steps:
   - "Want a different hero photo? Tell me what to search for."
   - "Want a softer voice? I can rerun in editorial-warm."
   - "Want to add a testimonials block? Share the testimonials."
   - "Want to publish the chatbot to LIVE now that the page exists? Just say so."

## Anti-patterns — DO NOT DO

- **Don't skip `get_workspace_state`.** You need the archetype, soul,
  and theme. Guessing wastes round-trips when the server overrides
  your picks anyway.
- **Don't write throat-clearing copy.** "Welcome to" / "Your trusted"
  / "Professional X services" are banned per every block's validator.
- **Don't propose templates outside the registry.** Templates are
  `cinematic-aura | viktor-light | velorah-editorial | nexora-light
  | securify-bold | stellar-tabs-white`. Picking anything else gets
  overridden server-side. Bold-urgency archetypes intentionally use
  empty template (the legacy variant renderer).
- **Don't generate Unsplash queries longer than 4 words.** Long
  queries zero-result. The server has archetype-curated fallbacks
  but those defeat your intent. Stick to 2-4 word queries.
- **Don't add features the workspace can't support.** If
  `integrations.twilio.configured` is false, don't promise SMS in
  copy. If Stripe isn't connected, don't say "pay deposit online."
- **Don't reorder blocks across persist calls.** Each `persist_block`
  call REPLACES that block type — order is determined at first persist.
  If you change your mind on order, call `update_landing_content` with
  the full new sequence.

## Worked example — bold-urgency (HVAC plumbing)

Operator: "build a landing page for ignitify in bold-urgency style"

1. `get_workspace_state(ws-1)` → archetype: bold-urgency, vertical: hvac,
   business_name: Ignitify Cooling, services: [AC Repair, AC Install,
   Furnace Repair, Maintenance], reviews: 13, emergency_service: true

2. Block sequence: hero → emergencyStrip → servicesGrid → faq → cta
   (skip testimonials since reviews < 50; add emergencyStrip per
   bold-urgency rule; add stickyMobileCTA)

3. `get_block_skill("hero")` → load voice rules (Hormozi-style,
   quantified, urgent), prop schema (headline / subhead / ctaPrimary /
   background_image_query / variant / template)

4. Generate hero props:
   ```json
   {
     "headline": "Same-Day AC & Furnace Repair Across El Paso",
     "subhead": "Ignitify Cooling — BBB-accredited, SuperPros 2024 Gold technicians who fix it right the first time. Honest pricing, financing available.",
     "ctaPrimary": { "label": "Get Service Today", "href": "/book" },
     "ctaSecondary": { "label": "Free Estimate", "href": "/intake" },
     "background_image_query": "hvac technician outdoor",
     "variant": "split-screen-50-50"
   }
   ```
   (Server will override variant to "split-screen-50-50" anyway since
   archetype is bold-urgency — your pick happens to match.)

5. `persist_block(ws-1, "hero", "...", props)` → returns ok + no
   warnings → continue to emergencyStrip

6. Repeat steps 3-5 for each subsequent block.

7. `get_workspace_snapshot(ws-1)` → confirm 5 sections rendered.

8. Report:
   > Landing page is live at https://ignitify-cooling.app.seldonframe.com.
   > Rendered in bold-urgency voice with 5 sections: hero, emergency strip,
   > services grid, FAQ, closing CTA. Hero uses split-screen-50-50 layout
   > with service-truck imagery. Want to tweak anything?

## Worked example — clinical-trust (dental practice)

Skip emergencyStrip. Lead with credentials in the hero subhead. Use
`nexora-light` template (archetype default). Lengthen FAQ with insurance
+ financing + "do you accept Medicare" type questions.

[Full prop JSON for each block omitted for brevity — follow the same
pattern as the bold-urgency example with the clinical-trust voice:
calm, authoritative, precise.]

## Worked example — cinematic-aspirational (medspa)

Lead with `projectGallery` immediately after hero. Hero uses
`cinematic-aura` template (archetype default) with a Pexels video
background. Soften FAQ to "what to expect" / "is it painful" tone.

[Full prop JSON for each block omitted for brevity — follow the same
pattern with the cinematic-aspirational voice: sensory, restorative,
intentional.]

## Integration notes

- **v1.54 archetype enforcement still fires.** Don't worry about
  picking the exact right template — the server overrides if you're
  off. Just match your COPY to the archetype voice.
- **Brain v2:** before generating, optionally call
  `list_brain_patterns(workspace_id)` to see what's worked for similar
  verticals. If brain patterns exist for "vertical=plumbing"
  (e.g., "service-truck hero photos performed best"), fold them into
  your block generation.
- **Validator gates are real.** If `persist_block` returns warnings,
  fix props and call again. Don't ship past validators.
