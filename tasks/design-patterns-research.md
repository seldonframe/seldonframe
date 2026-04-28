# Design pattern research — workspace blueprint system

**Status:** Phase 1 (research only). No code changes pending Max's review.
**Date:** 2026-04-28
**Branch:** `claude/blueprint-research`
**Scope:** Extract design DNA from Cal.com, Twenty, Formbricks, and best-in-class service-business landing pages to inform a deterministic workspace blueprint system. Each surface (booking, admin, intake, landing) re-implemented in SeldonFrame's codebase from these patterns — no source code copied.

---

## TL;DR

Across all four surfaces, the same handful of decisions separate "premium product" from "Bootstrap template": **muted off-white surfaces over pure white, hairline 1px borders instead of shadows, restrained brand color (one accent maximum), Inter or Inter+display-serif typography at a 1.25 modular scale, generous whitespace, and CSS-variable token systems that flex per workspace.** SeldonFrame should adopt **one unified token taxonomy** (semantic aliases over Radix Colors P3), one font pair (Geist/Cal Sans display + Inter body), one radius scale (xs:2 sm:4 md:8 lg:12 xl:20 pill:999), and one spacing rhythm — and reuse them across the booking, admin, intake, and landing surfaces. The blueprint JSON's job is to inject the dynamic business data into pre-designed slots; the design itself is handcrafted, not generated.

---

## 1. Cross-cutting design system (the spine all four surfaces share)

This is the most important section of the document. Without a unified token + font + spacing system, the four surfaces will visually drift even if each is individually polished.

### 1.1 Color token taxonomy

Adopted from Twenty's Radix-P3-derived semantic aliases, validated against Cal.com's `bg-default/subtle/emphasis` system. Recommended `--sf-*` prefix for namespacing.

| Token | Light | Dark | Used on |
|---|---|---|---|
| `--sf-bg-primary` | `gray1` ≈ `#FFFFFF` | `gray1` ≈ `#171717` | page surface |
| `--sf-bg-secondary` | `gray2` ≈ `#FCFCFC` | `gray2` ≈ `#1B1B1B` | sidebar, panel, surfaces-on-surface |
| `--sf-bg-muted` | `gray3` ≈ `#F9F9F9` | `gray4` ≈ `#1D1D1D` | hover, inactive |
| `--sf-bg-emphasis` | `gray5` ≈ `#EBEBEB` | `gray5` ≈ `#222222` | active state, strong hover |
| `--sf-fg-primary` | `gray12` ≈ `#333333` | `gray12` ≈ `#EBEBEB` | body text |
| `--sf-fg-emphasis` | `near-black` | `white` | titles, primary copy |
| `--sf-fg-muted` | `gray11` ≈ `#666666` | `gray11` ≈ `#B3B3B3` | meta, captions |
| `--sf-fg-subtle` | `gray9` ≈ `#999999` | `gray9` ≈ `#999999` | placeholders, disabled |
| `--sf-border-subtle` | `gray4` ≈ `#F1F1F1` | `gray4` | hairlines |
| `--sf-border-default` | `gray5` ≈ `#EBEBEB` | `gray5` | inputs, cards |
| `--sf-border-strong` | `gray6` ≈ `#D6D6D6` | `gray6` | focus, hover |
| `--sf-accent` | operator-chosen (default `gray12`) | inverted | CTA, primary action |
| `--sf-accent-soft` | derived (accent at L92%) | derived (L18%) | accent-tinted surfaces |
| `--sf-accent-fg` | derived via APCA | derived via APCA | text-on-accent (white or near-black) |
| `--sf-success` | `green9` P3 | `green9` | confirmations |
| `--sf-warning` | `orange9` P3 | `orange9` | scheduled-but-pending |
| `--sf-danger` | `red9` P3 | `red9` | errors, destructive |
| `--sf-ring` | `accent at α 0.5` | `accent at α 0.5` | focus rings |

Key non-obvious decisions:
- **Foreground is NEVER pure black**, it's `gray12` (`#333`). 6% delta. Reads as premium vs. harsh.
- **Page background is `#FFFFFF` for admin/booking but `#FAFAF7` (warm off-white) for the public landing page.** Pure white reads as "Wix template" on a service-business home; the warm tint reads as "agency-built." Admin/booking inherit Twenty/Cal.com's pure-white because the data density requires maximum contrast.
- **Default brand accent is `gray12`** (monochrome, à la Cal.com). Operator picks one accent; everything else derives. No gradients, no second accent.
- **Display-P3 source colors**, with sRGB fallback via `@supports (color: color(display-p3 ...))`. Wide-gamut on modern displays without falling apart on Windows Chromium.

### 1.2 Typography

Two fonts only:
- **Display (titles, hero, big numbers):** Cal Sans (BSD-licensed, calcom/sans) OR Geist (free, mature). Pick one and commit.
- **Body (everything else):** Inter at 400 / 500 / 600. No italics by default. No 700 weight unless on display.

Type scale (modular ratio 1.25):
| Token | px | rem | Usage |
|---|---|---|---|
| `--sf-text-xxs` | 11 | 0.6875 | badges, micro-caps |
| `--sf-text-xs` | 12 | 0.75 | sidebar items, meta |
| `--sf-text-sm` | 14 | 0.875 | body in dense surfaces (admin tables) |
| `--sf-text-md` | 16 | 1.0 | body in low-density (intake, landing body) |
| `--sf-text-lg` | 18 | 1.125 | body emphasis, lead |
| `--sf-text-xl` | 20 | 1.25 | h3 |
| `--sf-text-2xl` | 24 | 1.5 | h2 — record titles, event titles, section headers |
| `--sf-text-3xl` | 32 | 2.0 | h1 — hero on landing |
| `--sf-text-4xl` | 44 | 2.75 | landing hero only |

Body line-heights: `1.55` (sm/md), `1.4` (lg/xl), `1.2` (2xl+).

Critical: configure font-feature-settings on Cal Sans (`cv01–cv06, ss02, ss03`) or it looks subtly off. Inter gets `tabular-nums` only on tables.

### 1.3 Radius + spacing + elevation

Radius scale (semantic, not Tailwind defaults):
| Token | px | Usage |
|---|---|---|
| `--sf-radius-xs` | 2 | tags, status pills (square-ish) |
| `--sf-radius-sm` | 4 | buttons, chips, slot pills |
| `--sf-radius-md` | 8 | cards, dropdowns, inputs |
| `--sf-radius-lg` | 12 | major surface containers (booker shell, landing cards) |
| `--sf-radius-xl` | 20 | modals, hero image cards |
| `--sf-radius-pill` | 999 | filter pills, "Required" pill |
| `--sf-radius-round` | 100% | avatars |

Spacing rhythm: Tailwind's default spacing scale (`gap-1 ... gap-12`) — but with strict discipline:
- `gap-2` for icon+label rows
- `gap-4` is the dominant inter-element gap
- `gap-6` for section subdivisions
- `gap-8` for major section breaks
- Outer page padding: `p-6` mobile, `p-8` desktop, `p-12` on the booker/landing shell

Elevation system (the key restraint rule from Twenty + Cal.com):
- **Static surfaces have NO shadow.** They use 1px `--sf-border-subtle` strokes.
- **Floating layers** (dropdowns, popovers): `shadow-sm` + 1px border.
- **Modals**: 3-stop shadow stack (`0 0 8px gray7-α, 0 8px 64px -16px gray10-α, 0 24px 56px -16px gray5-α`). This is the only place the elevation budget gets spent.
- **Dragged elements** (kanban cards): `shadow-md` while dragging only.
- Never `shadow-lg`. Never double borders. Never glossy shadows.

### 1.4 Density per surface

| Surface | Row height | Cell padding | Outer padding |
|---|---|---|---|
| Booking | event card 56px, slot pill 44px | `px-4 py-3` | `p-8` shell |
| Admin tables | 32px row | `px-3 py-2` (~6/8 px) | `p-6` page |
| Admin record page | n/a | `px-4 py-3` widget | `p-8` page |
| Intake | n/a (one card) | `px-4` viewport, `space-y-4` | `p-6` outer card |
| Landing | n/a | `px-4 sm:px-6 lg:px-8` | `py-16` section, `py-24` hero |

The admin density (32px rows) matches Twenty exactly. The other three are looser because their content surface differs.

### 1.5 Responsive philosophy

- **Mobile-first** in CSS (default styles target mobile; `md:`/`lg:` breakpoints add desktop).
- Only **two meaningful breakpoints** matter for layout shifts:
  - `md` (768px) — landing page goes from stacked to side-by-side hero, services grid goes from 1-col to 2-col.
  - `lg` (1024px) — booking shell goes from stacked to 2/3-col, admin sidebar collapses to icon-only on tablet, landing services grid to 3-col.
- Below `lg`, every multi-column surface stacks vertically. No horizontal scrolls except admin tables (which keep a sticky-left first column).

### 1.6 Slot system (the dynamic surface)

This is the contract between blueprint JSON and rendered HTML. **Static structure ≠ dynamic data.** The blueprint provides values for these slots only; everything else is hardcoded.

Common slots across all surfaces:
| Slot | Type | Source in blueprint |
|---|---|---|
| `workspace.name` | string | `workspace.name` |
| `workspace.tagline` | string (optional) | `workspace.tagline` |
| `workspace.logo` | URL or null | `workspace.theme.logoUrl` |
| `workspace.accent` | hex | `workspace.theme.accentColor` |
| `workspace.contact.phone` | E.164 string | `workspace.contact.phone` |
| `workspace.contact.address` | object {street, city, state, zip} | `workspace.contact.address` |
| `workspace.contact.hours` | object {monday: "7-19", ...} | `workspace.contact.hours` |
| `workspace.contact.serviceArea` | string (e.g. "Tarrant + Dallas counties") | `workspace.contact.serviceArea` |

Surface-specific slots: documented per-surface below.

---

## 2. Booking surface (Cal.com patterns)

### 2.1 Layout structure

Public booking page at `<slug>.app.seldonframe.com/book`. CSS-Grid driven, with named template areas that change based on state:

```
state = browsing       state = selecting_time      state = booking
┌────────┬─────┐       ┌────────┬─────┬────┐       ┌────────┬─────┬────┐
│  meta  │main │       │  meta  │main │slot│       │  meta  │main │form│
└────────┴─────┘       └────────┴─────┴────┘       └────────┴─────┴────┘
  240px   480px         240px   420px 280px         240px   420px 380px
```

Section ordering within each region:
1. **Header strip** (full-width, optional): workspace logo + name. Hidden on `?embed=1`.
2. **Meta sidebar** (left column, 240–424px): avatar/logo, event title (h2 Cal Sans 24px), short description, then icon+label rows (Duration, Location, Host), Timezone selector at the bottom.
3. **Main** (center, 420–480px): month name + chevrons, weekday header row, 6×7 date grid. Available dates emphasized.
4. **Timeslots** (right, 240–280px, only after a date is picked): sticky header with selected date + 12h/24h toggle, vertical scroll list of time pills.
5. **Form** (replaces timeslots after slot picked): name, email, notes, optional custom questions, primary "Confirm" CTA + "Back" link.
6. **Confirmation** (in-place, replaces form): check icon, "Meeting scheduled" heading, summary card, "Add to calendar" dropdown (Google/Outlook/iCal), Reschedule, Cancel.

Mobile (<lg): all four areas stack vertically. Date click → page scrolls to slots. Slot click → page scrolls to form.

### 2.2 Component hierarchy

```
BookerStoreProvider (Zustand: state, layout, selectedDate, selectedSlot)
└── BookerShell (rounded-lg border-subtle p-8 max-w-screen-lg)
    ├── BookerSection[area="header"] (optional)
    ├── BookerSection[area="meta"]
    │   └── EventMeta
    │       ├── Avatar / Title / Description
    │       ├── EventDetailsList (Duration, Location, Host)
    │       └── TimezoneSelect
    ├── BookerSection[area="main"]
    │   └── DatePicker (MonthView)
    │       ├── MonthChevrons
    │       ├── WeekdayHeader (Mon..Sun)
    │       └── DateGrid (42 cells, "available" emphasis)
    ├── BookerSection[area="timeslots"]
    │   └── AvailableTimeSlots
    │       ├── DateLabelRow (selected date + 12h/24h toggle)
    │       └── SlotList (scrollable pill stack)
    └── BookEventForm (state="booking")
        ├── FormFields (name, email, notes, custom Q&A)
        ├── BackButton
        └── ConfirmButton
```

### 2.3 Slot positions

| Slot | Source in blueprint |
|---|---|
| `event.title` | `booking.event_type.title` (e.g. "Free in-home estimate") |
| `event.description` | `booking.event_type.description` |
| `event.duration_minutes` | `booking.event_type.duration_minutes` |
| `event.location` | `booking.event_type.location` (e.g. "On-site at customer address") |
| `availability.weekly` | `booking.availability` (per-weekday hour ranges) |
| `availability.timezone` | `workspace.contact.timezone` |
| `form.fields` | `booking.form_fields` (name + email always; custom appended) |
| `confirmation.message` | `booking.confirmation_message` |
| `confirmation.success_redirect_url` | `booking.success_redirect_url` (optional) |

### 2.4 Tailwind class conventions

- Container shell: `rounded-lg border border-[--sf-border-subtle] bg-[--sf-bg-primary] shadow-sm p-6 md:p-8`
- Slot pill: `rounded-md border border-[--sf-border-default] bg-[--sf-bg-secondary] px-4 py-3 text-sm font-medium hover:bg-[--sf-bg-muted]`
- Selected date cell: `bg-[--sf-accent] text-[--sf-accent-fg]` (otherwise transparent on hover-bg)
- Confirm button: `bg-[--sf-accent] text-[--sf-accent-fg] rounded-md px-4 py-2.5 font-medium hover:bg-[--sf-accent]/90`
- Sidebar meta row: `flex items-center gap-2 text-sm text-[--sf-fg-muted]`
- Grid layout: native CSS `grid-template-areas` with CSS-var widths (NOT Tailwind grid-cols-N)

### 2.5 Timezone handling

- Auto-detect via `Intl.DateTimeFormat().resolvedOptions().timeZone` on first visit.
- Persist in `localStorage` (key `sf.timezone`).
- URL param `tz=<IANA>` overrides for the session BUT does not write back to localStorage (embed-friendly).
- Visible position: bottom of meta sidebar.
- Re-render the slot list on TZ change (not just labels — host availability rules can flip).

### 2.6 The 3-5 design decisions to copy

1. **Monochrome brand by default.** Black on white (light) / white on black (dark). Accent only used on date-active state. Workspace operator can override with one color; everything else derives.
2. **Hairline borders + minimal shadow.** `border-subtle` + `shadow-sm` is the entire elevation system. Reflows are CSS-var-driven, not className swaps.
3. **Whitespace ratio favors the calendar.** Sidebar narrow, calendar wide, slots narrow. Let the calendar breathe. Generous outer padding (24-48px).
4. **Cal Sans display + Inter body.** Free, BSD/SIL, instantly premium. Half the perceived quality is the display font.
5. **In-page success step**, not a redirect. Animates over the form region; better for embeds + analytics + flow.

### 2.7 Skip / DON'T copy

- The `customClassNames` API surface (50+ keys) — Cal.com built it for embedded-atom customers. SeldonFrame is first-party; use slot props.
- The plugin/app-store architecture in `packages/app-store/`.
- Three layouts (`MONTH_VIEW`, `WEEK_VIEW`, `COLUMN_VIEW`). Ship `MONTH_VIEW` only at first.
- Client-side slot reservation (`useSlotReservationId`). Solve double-booking server-side with a 409 on conflict.

---

## 3. Admin surface (Twenty patterns)

### 3.1 App shell layout

Single left sidebar, no top bar. Full-bleed content right.

Sidebar order (top → bottom):
1. **Workspace switcher** (top-left, click to switch workspaces).
2. **Search trigger** (Cmd+K opens command palette).
3. **Favorites** (user-pinned views, records).
4. **Workspace objects** (Contacts, Deals, Activities, custom objects). Drag-reorderable, foldable into named folders ("Sales", "Operations").
5. **Settings/Wrench** for theme + billing.
6. **Profile menu** at bottom-left.

Breadcrumbs (`Workspace › Contacts › Jane Doe`) inline at top of content area when inside a record.

### 3.2 Table view

Custom-built (no library). The "Figma-quality" feel comes from these specific behaviors:
- **Hover-to-reveal column resizer**: 1px drag affordance appears between headers on hover only. No permanent grippers.
- **Hover-only checkbox column**: 24px-wide, fades in on row hover.
- **Cell-as-editor**: every cell IS an inline editor. Single click → 2px accent outline. Double-click or Enter → type-specific editor swap (text, date, currency, multi-select pills, relation chip-picker). Esc reverts. Enter commits + moves down. Tab moves right.
- **Sticky-left first column** (record name) stays visible during horizontal scroll.
- **Filter chips above the table** with inline edit + "X" remove. Sort chips show arrow.
- **Group-by** collapsible groups based on a Select field. Group headers show count + sum/avg.
- **Selection**: checkbox + shift+click range + Cmd+A. Selection bar slides up from bottom with bulk actions.
- **Virtualization** for >500 rows. Infinite scroll with "Load more" sentinel — no traditional pager.

Cell padding: `px-3 py-2` (~6/8 px). Row height: 32px. Tabular-nums on Inter for numeric columns.

### 3.3 Record detail page

Two-column layout:
- **Header**: large emoji/icon + record title (h1, font-weight 600, 24px), inline-editable. Below: "show page chips" — key fields (status pill, owner avatar, amount) as compact inline cells.
- **Tabs row** (Overview, Notes, Tasks, Emails, Files, Activity). Active tab: 2px bottom border. No background fill.
- **Main content (left ~60%)**: stack of widgets — Fields (grouped), Related records (mini-tables), Notes, Files, Charts, Activity timeline. Drag-positionable in layout-edit mode.
- **Right side panel (~40%)**: contextual related-records + activity feed. Resizable.
- **No edit-mode toggle.** Hover-to-reveal-edit on every field. Layout-edit (re-arranging widgets) is a separate Cmd+K command.

### 3.4 Kanban / board view

Board view from a Select field on the object (typically `stage`).
- **Column header**: stage name + record count + aggregate (sum, avg, min, max) right-aligned.
- **Card**: ~280px wide, 1px gray5 border, 8px radius, gray1 fill, 12px padding. Title semibold + 2-4 muted-gray meta rows. Avatar/logo top-right.
- **Drag-and-drop**: HTML5 DnD. Drop targets show 2px accent dashed outline. Dragged card lifts with `shadow-md`.
- **Card-add**: "+" in column header opens inline create-card row at top of column. No modal.
- **Empty column**: dashed-border drop zone, "Drop cards here" muted text.
- Recommended: 5-7 stages.

### 3.5 Slot positions

| Slot | Source in blueprint |
|---|---|
| `workspace.name` | sidebar header |
| `objects[]` | sidebar items (with icon, label, sort order) |
| `objects[].fields[]` | column definitions for table view, field groups for record page |
| `objects[].views[]` | named saved views (table, kanban, calendar) per object |
| `objects[].pipelines[]` | kanban stage definitions |
| `record.fields[]` | dynamic per-record field values |
| `record.related[]` | related-records in side panel |

### 3.6 Tailwind conventions

- Sidebar item: `flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm hover:bg-[--sf-bg-muted]` (active: `bg-[--sf-bg-emphasis] text-[--sf-fg-emphasis]`)
- Table cell: `px-3 py-2 text-sm border-b border-[--sf-border-subtle] hover:bg-[--sf-bg-muted]`
- Status pill: `inline-flex items-center rounded-pill border border-[--sf-border-subtle] bg-[--accent-soft] px-2.5 py-0.5 text-xxs font-medium text-[--accent]` (using Radix `*3` bg + `*11` fg)
- Kanban card: `rounded-md border border-[--sf-border-default] bg-[--sf-bg-primary] p-3`
- Modal: `rounded-xl bg-[--sf-bg-primary] p-6` + the 3-stop shadow stack
- Avatar (square for orgs): `rounded-md` + initial-color hash. Avatar (circle for people): `rounded-full`.

### 3.7 The 3-5 design decisions to copy

1. **Cell-is-editor pattern** — table cells and record page fields use the SAME `<RecordCell>` component. Identical hover affordance, focus ring, keyboard semantics. The unification is invisible-but-massive.
2. **Border-not-shadow aesthetic** — 1px gray5 strokes for 95% of containment. Shadow only for floating layers. This single rule kills the "card-and-shadow CRM" look.
3. **Radix P3 level-9 as accent ceiling** — never go darker than `*9` for primary. Display-P3 source = subtle vibrancy on modern displays.
4. **Tabs + Widgets, not Tabs + Form** — record page is a content surface (Notion-like), not a database form (Salesforce-like). Drag widgets, hide fields per tab. Layout is data.
5. **Density at 32px row** — slightly tighter than Notion, with 6/8 px cell padding + tabular-nums Inter. Professional but not Excel-grim.

Bonus: **Cmd+K everywhere** — single search/jump/customize entry replaces ribbon + breadcrumb + search.

### 3.8 Skip / DON'T copy

- The GraphQL metadata engine (`twenty-server`'s schema-generation pipeline). Their per-tenant runtime GraphQL schema is overkill — SeldonFrame's data model is BLOCK.md, not a runtime metadata table.
- Linaria CSS-in-JS. Stick with Tailwind 4 + shadcn — same token set, deeper ecosystem.
- Jotai everywhere. Twenty has 100+ atoms; React Query + a few Zustand slices is enough.
- Their workflow/automations subsystem (BullMQ + workflow engine). SeldonFrame already has its own.
- The in-app data-modeler. SeldonFrame edits its blueprint as code — no in-app field-add modal.

---

## 4. Intake surface (Formbricks patterns)

### 4.1 Multi-step flow

One question per card by default, with a stacked-cards container that visually layers prev/current/next behind each other and animates forward on advance.

State = `{ currentBlockId: string | "start" | <ending-id> }`. Progress = `(idx + 1) / total_blocks`.

Progress indicator: 2px-tall horizontal bar at top of card, with 500ms width transition. **No "Step 3 of 7" counter.** Welcome = 0%, ending = 100%.

Forward/back: submit button is the primary CTA per card; back button is a quiet ghost button to its left. Same row, opposite alignments. Last question's submit label flips from `Next` → `Finish`.

Required signaling **inverted from Bootstrap norm**: required is the default (no asterisk). A tiny "Required" pill sits ABOVE the headline text only when `required && isQuestionCard`, at `text-xxs leading-6 opacity-60`. The visual quietude is what makes the cards feel calm.

### 4.2 Question card layout

```
┌───────────────────────────────────────┐  ScrollableContainer max-height: 60dvh
│  [optional media: image or video]      │  with edge-fade gradients at top/bottom
│                                        │  + floating "scroll to bottom" button
│  • Required (tiny pill if required)    │
│  Question headline (h2, 24px, label)   │
│  Helper text (muted, smaller)          │
│                                        │
│  [Input — type-specific]               │
│                                        │
│  Inline error (red, no icon)           │
│  Inline char counter (muted, right)    │
└───────────────────────────────────────┘
        Back ←                Next →    ← Action row OUTSIDE scroll container
```

Card padding: `px-4` viewport, `space-y-4` between header and input. Card max-width: 640px outer (mobile = full-width).

ScrollableContainer is the polish: top/bottom gradient masks fade content into the scroll region. Content never blows out the card; overflow looks intentional.

### 4.3 Field type components

Common shell: `ElementHeader` (label + helper) → input → inline error → optional inline char counter.

Type-specific:
- **Text / textarea / email / number / phone / url**: shared `<Input>` shell, `bg-[--sf-bg-secondary] border border-[--sf-border-default] rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[--sf-ring]`. No floating label — label always above. Helper text below label, NOT next to input.
- **Single select (radio)**: clickable bordered tile per option. Selected = `bg-[--sf-accent-soft] border-[--sf-accent]`. Optional "Other" reveals an inline `<Input>` below the group.
- **Single select (dropdown)**: dropdown for >7 options, opens with search input at top.
- **Multi-select**: same tile list, checkbox-style. "None of the above" supports mutual exclusivity.
- **Rating / NPS**: number scale (row of equal-width pill buttons), star icons, or smiley faces. NPS = number scale 0-10 with low/high labels beneath. **Pick one for v1** — number is most universal.
- **Date picker**: inline calendar grid (react-day-picker style). Values stored as ISO `YYYY-MM-DD`.
- **File upload**: drag-and-drop dashed-border zone. Uploaded files appear as small bordered tiles with delete X.

Visual difference from plain Bootstrap: input bg is `gray2` not `gray1`, focus ring is brand-colored with offset, default radius is `8px`. Spacing is `space-y-4` between header and input wrapper.

### 4.4 Slot positions

| Slot | Source in blueprint |
|---|---|
| `intake.title` | `intake.title` |
| `intake.description` | `intake.description` |
| `intake.questions[]` | array of question blocks |
| `intake.questions[].id` | unique id |
| `intake.questions[].type` | text / textarea / email / select / multi-select / rating / date |
| `intake.questions[].label` | question headline |
| `intake.questions[].helper` | optional helper |
| `intake.questions[].required` | bool |
| `intake.questions[].options` | for select / multi-select / rating |
| `intake.questions[].validation` | regex / min / max (per type) |
| `intake.questions[].logic` | optional show-if conditions |
| `intake.completion.headline` | thank-you headline |
| `intake.completion.message` | thank-you body |
| `intake.completion.cta` | optional follow-up CTA (label + URL) |
| `intake.theme` | inherited from `workspace.theme` |

### 4.5 Theming

Pure CSS-variable surface. NO React theme provider. The runtime emits a `#sf-intake` style scope and exposes `--sf-*` tokens. Tailwind utility classes mapped to vars in config.

Operator changes brand color → updates one var → 25 components reflect it without re-render. Including the SVG checkmark on thank-you, the rating star fill, and the scrollbar thumb (Webkit + Firefox).

### 4.6 Conditional logic

Builder UX (in the operator's admin, NOT runtime): "If [question1] [equals] [option A] AND [question2] [is greater than] [5] → then [Jump to question 7]". `+ AND` / `+ OR` to add subconditions.

Runtime: hidden questions are **skipped silently** — survey navigates past, response data omits them entirely (no "inactive" placeholder shown).

For SeldonFrame v1: ship simple show-if conditions only. Skip `calculate`, `setVariable`, `recall` (token replacement). Add later if user research demands.

### 4.7 Accessibility

- Headline rendered as `<label htmlFor={id}>` — real HTML association.
- `aria-required={required}` on inputs.
- Focus ring: `focus:ring-2 focus:ring-offset-2 focus:ring-[--sf-ring] focus:outline-hidden`.
- Keyboard: `Enter` advances. `Cmd/Ctrl + Enter` always submits (document-level handler). Tab order explicit.
- Per-card autofocus: first input focused 200ms after mount.
- `aria-describedby` linking error to input — Formbricks gap; we should fix.

### 4.8 The 3-5 design decisions to copy

1. **Stacked-cards container** with prev/next layered behind current. Survey feels like a deck being riffled, not a page reload.
2. **Inverted required signaling** — required is ambient, optional gets called out (via no pill). Calmer than the asterisk-everywhere norm.
3. **ScrollableContainer with edge gradients** — long questions never blow out the card; gradient masks make overflow look intentional.
4. **CSS-variable-only theme surface** — operators change brand color via one var, 25 components reflect it without re-render.
5. **Per-card autofocus + Cmd/Ctrl+Enter** — power users get keyboard-only flow without learning curve. The difference between "I filled out a form" and "I had a conversation."

### 4.9 Skip / DON'T copy

- The Preact-in-iframe SDK delivery model. SeldonFrame intake renders inside the workspace app — normal React component.
- The `ResponseQueue` + offline storage. First-run intake submits once, online; offline queueing is overkill.
- The full `evaluateLogic` engine with variables, recall, and `calculate` actions. Show-if is enough for v1.
- `react-i18next` for single-locale launch.
- Their `ttc` (time-to-completion) tracking and analytics ingestion in every element.
- The headline DOMPurify sanitization — only needed if blueprint allows rich HTML; plain strings don't.

---

## 5. Landing surface (composite patterns from Tailwind UI + best service-business sites)

### 5.1 Section ordering (canonical)

The order that converts on service-business landing pages:

1. **Sticky header** — logo, nav, **phone number visible**, primary CTA ("Book" / "Get Quote")
2. **Hero** — eyebrow (city/service) + H1 (outcome-oriented, ≤8 words) + subhead (proof or scope) + CTA pair (primary book + secondary `tel:`) + visual (real photo, not stock)
3. **Trust strip** (immediately under hero) — Google stars + review count + years in business + accreditations
4. **Services grid** — 3-column dominant; 4-col if exactly 4 services; group with Tabs if 6+
5. **Why us / About** — real team photo + founder/owner story (humanizes the brand)
6. **Mid-page conversion CTA** — embedded form (NOT modal-only) with phone alternative
7. **Testimonials** — single highlighted quote + 3-up grid (NOT carousel)
8. **Service area / map**
9. **FAQ** (accordion only)
10. **Footer** — NAP (name/address/phone), hours, social, secondary nav

Vertical-specific exceptions:
- **Emergency trades** (HVAC, plumbing): emergency phone strip ABOVE the hero, red/orange-accented
- **Bridal / luxury salons**: portfolio gallery ABOVE services (aesthetic IS the proof)
- **Legal**: "Services" → "Practice Areas" + "As Seen In" press strip
- **Coaching**: portrait of founder elevated into hero

### 5.2 Hero pattern

Structure:
- `<eyebrow>Atlanta · Family Dentistry</eyebrow>` (small uppercase gray)
- `<h1>A cool home in 24 hours</h1>` (large, display font, outcome-oriented)
- `<p>Subhead: 1-2 lines, proof or scope</p>`
- `<CTA pair>Book online | (555) 123-4567</CTA pair>` (primary + tel: secondary)
- `<HeroImage>` real photo of team or office, color-graded to palette

Mobile considerations:
- Phone number sticky in bottom bar (full-width "Call Now") — never buried in hamburger
- Headline ≤ 8 words to fit 2 lines on 360px without orphaning
- CTAs stack with full thumb-width (≥ 44px touch target)
- Hero image becomes 16:9 banner above text (never side-by-side at small widths)

The 3 things great heroes do that mediocre ones don't:
1. **State location explicitly** in H1 ("Atlanta family dentistry," not "Family dentistry"). Local trust starts in H1.
2. **Real photo of actual team or office** above the fold — stock photography is a measurable conversion killer.
3. **Pair booking CTA with click-to-call alternative.** People who won't fill a form will tap a number; people who hate phones will book.

### 5.3 Services grid

3-column default. Card structure: line-icon (single accent color) + 2-3 word title + 1-2 line description + "Learn more" link. Price-from optional (works for salons/dental, not HVAC/legal where scope varies).

Inline CTA per card hurts more than helps. **One CTA at the bottom of the section converts better.**

Generalist trap: listing 15 services flat signals "we're not great at any of these." Group with `Tabs` (e.g. Heating / Cooling / Indoor Air for HVAC) or split "Core services" + "Also offered."

### 5.4 Trust signals

Three placements:
1. **Thin trust strip** directly under hero (single line: "4.9 stars · 1,200+ Google reviews · BBB A+ · 20 years in DFW")
2. **Floating low-corner widget** on desktop (Nina Madden's pattern)
3. **Inside testimonials section**

Testimonials that convert:
- **Single highlighted quote** at top + **3-up grid** below. Carousels look elegant and underperform.
- Each card: avatar (real photo, not initials), full name, location/role, 2-3 sentence quote, 5-star visual, "verified" / Google badge.

Accreditations: monochrome (or grayscale on hover) row of BBB, Google Reviews, vendor partners (Trane, Lennox, Invisalign, Aveda, Avvo). Place in trust strip OR just above footer. Never full-color saturation.

**The legitimacy multiplier**: trust signals work when **proximate to a CTA**. A "Book now" surrounded by 4.9 stars / 1,200 reviews / 20 years / BBB A+ converts dramatically better than the same button alone.

### 5.5 Local-business specifics

- Phone in **top-right of header** as `tel:` link with phone icon. Sticky bottom bar on mobile.
- **Service-area map**: embedded Google Map with polygon or city list.
- **Hours**: in footer + near booking CTA. Dynamic "Open now / Closed" badge converts.
- **Address**: NAP block in footer, schema-marked.
- **Click-to-call mobile pattern**: full-width "Call (555) 123-4567" button hero on mobile only.
- **Emergency / after-hours**: separate red/orange-accented strip ("24/7 Emergency · 555-123-4567"), visually breaks page palette.

### 5.6 Slot positions

| Slot | Source in blueprint |
|---|---|
| `landing.hero.eyebrow` | derived from `workspace.industry` + `workspace.contact.serviceArea` |
| `landing.hero.headline` | `landing.hero.headline` (operator-editable) |
| `landing.hero.subhead` | `landing.hero.subhead` |
| `landing.hero.cta_primary` | `landing.hero.cta_primary` (default "Book online") |
| `landing.hero.image_url` | `workspace.theme.heroImageUrl` (with empty-state placeholder demanding upload) |
| `landing.trust_strip[]` | computed: stars + review count + years + accreditations |
| `landing.services[]` | array of `{icon, title, description, learn_more_url?, price_from?}` |
| `landing.about` | `{photo_url, headline, body, owner_name?, owner_title?}` |
| `landing.testimonials[]` | array of `{quote, author_name, author_role, avatar_url, source}` |
| `landing.faq[]` | array of `{question, answer}` |
| `landing.contact.phone` | shared from workspace |
| `landing.contact.address` | shared from workspace |
| `landing.contact.hours` | shared from workspace |
| `landing.emergency_strip` | optional `{label, phone, accent_color}` (HVAC/plumbing) |

### 5.7 Tailwind UI patterns to base on

The composition that covers all 10 verticals named in the brief (HVAC, dental, legal, salon, etc.):
- **Hero Sections → Split layout (image right)** — workhorse for HVAC/dental/legal/coaching
- **Feature Sections → Three-column grid with icon-led features** — services grid
- **Testimonials → Single featured + grid** — single highlighted quote + 3-up
- **CTA Sections → Split CTA** — paired with inline form OR phone callout
- **FAQs → Accordion**
- **Logo Clouds → Horizontal logo row** — accreditations / vendor partners
- **Footers → Multi-column footer (4-5 columns)** — NAP, hours, services, areas, social

shadcn primitives: `Card`, `Button`, `Badge`, `Avatar`, `Accordion`, `Tabs`, `Separator`, `Sheet` (mobile nav), `Dialog` (quote modal), `Form` + `Input` + `Textarea` + `Select`, `Sonner` (toast), `Carousel` (portfolio only — NOT testimonials).

### 5.8 The 3-5 design decisions that convert

1. **Phone number in header AND sticky mobile call bar.** Not in hamburger, not footer alone. Largest single conversion lift on local-service sites.
2. **Real photo of actual team or owner above the fold or in About strip.** Stock photography is a measurable conversion killer.
3. **Trust strip directly under hero**: stars + reviews + years + accreditations. Proximity of proof to first CTA = multiplier.
4. **Single quote/booking CTA mid-page with form embedded** (not button to modal). Embedded > button-to-modal > separate page.
5. **Service area + hours visible**, not buried. Eliminates the #1 abandonment reason: "are they open / do they cover me?"

### 5.9 Skip / DON'T copy from SaaS landing pages

- **Three-tier pricing comparison.** Service businesses sell quotes/visits, not tiers. Price-from inside service cards if at all.
- **"Trusted by" startup logo wall.** Service businesses don't have customer logos; they have Google reviews and vendor accreditations.
- **Animated gradient hero, particle backgrounds, floating 3D mockups.** Reads as tech-bro, not local trust.
- **"Book a demo" / "Start free trial" CTAs.** Always "Book now" / "Get a quote" / "Call us today."
- **Long product-feature deep-dives.** Replace with crisp service descriptions; depth lives on per-service subpages (out of v1 scope).
- **Newsletter signup as primary conversion.** Service businesses don't run newsletters; they run booking flows.

### 5.10 General template + light vertical overlays

**Recommendation: ship ONE general "service business" template** as the deterministic default — every workspace gets this on `create_workspace`. Then ship **light vertical overlays** that change *content tokens, not structure*:
- HVAC: adds emergency strip + service-area map
- Dental: swaps "Services" → "Treatments", adds Invisalign-style partner logos
- Legal: swaps "Services" → "Practice Areas", adds "As Seen In" strip
- Salon: adds portfolio carousel above services grid
- Coaching: elevates founder photo into hero

Structural skeleton stays identical. Avoid building 10 distinct vertical templates; build one + 10 content packs. Matches the deterministic-blueprint principle.

---

## 6. Phase 2 schema implications

This document is the spec; Phase 2 turns it into JSON. Some structural decisions surface during research:

### 6.1 The blueprint is a tree of typed sections

Top-level shape:
```
{
  "version": 1,
  "workspace": { name, industry, theme, contact },
  "landing":   { renderer: "general-service-v1", sections: [...], slots: {...} },
  "booking":   { renderer: "calcom-month-v1",    event_type, availability, form_fields, confirmation },
  "intake":    { renderer: "formbricks-stack-v1", title, questions[], completion },
  "admin":     { renderer: "twenty-shell-v1",    objects[], sidebar_order, default_views }
}
```

Each `renderer` value maps to a frozen TS component set. Versioned (`-v1`) so future renderers can ship without breaking existing blueprints.

### 6.2 Theme is shared, surfaces inherit

`workspace.theme` defines the token overrides ONCE:
```
{
  "mode": "light" | "dark",
  "accent": "#1E40AF",
  "logo_url": "...",
  "hero_image_url": "...",
  "display_font": "cal-sans" | "geist",
  "body_font": "inter",
  "radius": "default" | "minimal" | "rounded"
}
```

All four surfaces consume from the same token resolution. Operator picks one accent → it propagates to landing CTAs, booking confirm button, intake submit button, admin focus rings.

### 6.3 Rendering is deterministic

Same blueprint JSON → same HTML/CSS, byte-for-byte. No LLM in the rendering path. The blueprint is generated/edited (potentially by Claude Code from natural-language input), but the rendering is hand-written components reading typed fields.

This is the load-bearing claim of the system. Implications:
- Renderer functions are pure: `(blueprint, theme) => HTMLString`.
- Tests assert byte-equality of output for fixed input.
- Updating a renderer (`general-service-v1` → `general-service-v2`) is an explicit blueprint migration.

### 6.4 First template = "general"

Per Max's "DO NOT build a generic template engine" constraint: ship ONE polished general template (general-service-v1) before any vertical overlays. Test it with HVAC, dental, salon, legal, coaching, and validate it survives all five before adding vertical-specific renderers.

If general-v1 covers 90% of cases and vertical overlays are content-only (logos, copy, sections), the system stays simple. If it doesn't, that's a Phase 3 finding to revisit.

### 6.5 Light mode default

All four surfaces default to light mode. Dark mode is an opt-in `workspace.theme.mode = "dark"`. Reasons:
- Service businesses' customers expect light mode (warm, trustworthy)
- Twenty's premium feel is in its light mode
- Cal.com and Formbricks both default light
- Dark mode is a tax (every component must be tested twice); ship light first, validate, add dark later

### 6.6 Admin access for guest workspaces

Per the cleanroom finding: admin URL pattern is `app.seldonframe.com/switch-workspace?to=<orgId>&next=<path>`, which requires login + membership. For guest workspaces (created without `SELDONFRAME_API_KEY`), there's currently no membership → admin denies.

Bearer-token-only admin would unblock guest operators viewing their own workspace data without a signup. Schema implication:
```
{
  "admin": {
    "auth_modes": ["session", "bearer"],
    "guest_workspace_bearer_url": "https://app.seldonframe.com/g/<wsp_id>?token=<bearer>"
  }
}
```

This is a Phase 3 implementation question, not a Phase 2 schema question. Flagged here so it doesn't get lost.

---

## 7. Open questions for Max before Phase 2 starts

1. **Display font: Cal Sans or Geist?** Both BSD-license-compatible. Cal Sans has more personality on titles; Geist is more neutral. Pick one; we'll use it everywhere display-typeset.
2. **Token prefix: `--sf-*` or something else?** Recommended `--sf-*` to avoid clashing with shadcn defaults. Confirm or override.
3. **Single accent or accent + secondary?** I recommend single (per Cal.com/Twenty discipline). Operator picks one, system derives soft/hover/ring. Confirm.
4. **Off-white landing background `#FAFAF7`** vs pure white. I recommend warm off-white for landing only; admin/booking stay pure white. Confirm.
5. **Vertical overlay strategy: content packs vs distinct renderers?** I recommend content packs (one structural template, vertical-specific copy/icons/sections). Confirm.
6. **Dark mode in v1 or v2?** I recommend v2 — ship light mode polished first, add dark later.
7. **Bearer-token admin for guest workspaces?** Phase 3 question but it affects schema shape — keep option in mind.
8. **One-renderer-per-surface or pluggable?** I recommend frozen `*-v1` renderers per surface for v1, with versioning slot for future. Confirm.

---

## 8. What's next

Per Max's spec: STOP after Phase 1.

Pending review:
- This document (full pattern research)
- The 8 open questions above

Once approved:
- Phase 2: define the JSON schema + write `skills/templates/schema.json`, `skills/templates/general.json`, `skills/templates/hvac.json`
- Phase 3: implement the template renderer, update `buildSeededHomeHtml()`, propagate theme to all surfaces

Length cap reached. Standing by for review.
