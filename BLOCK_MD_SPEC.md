# BLOCK.md Specification v1.0

> Write a spec. Any AI builds it. Every soul personalizes it.

A BLOCK.md is a universal blueprint for a SeldonFrame block.
It describes WHAT the block does, not HOW it is implemented.
Any AI coding agent can read a BLOCK.md, inspect the host SeldonFrame codebase, and generate the required code.

The BLOCK.md is:
- **Codebase-agnostic** — does not depend on specific frameworks, ORMs, or file paths
- **Database-agnostic** — describes entities and fields, not tables and columns
- **Soul-agnostic** — reads from whatever identity layer the host provides
- **Block-agnostic** — works with any combination of other installed blocks

Think of BLOCK.md like a Lego brick: standardized connectors, compatible with other bricks, independent from the final build shape.

---

## Format

A BLOCK.md has 6 sections.

### 1. Purpose
One paragraph describing what the block does and who it serves.

### 2. Entities
The data the block manages. Each entity defines:
- Name
- Fields with explicit types
- Relationships to other entities

Supported field types:
- `text`: short string
- `long text`: paragraph text, markdown, or HTML
- `rich text`: formatted editor content
- `currency`: decimal amount + currency code
- `enum`: one value from a fixed list
- `url`: web address
- `timestamp`: date/time (optionally auto-generated)
- `integer`: whole number
- `boolean`: true/false
- `key-value map`: flexible JSON-like object
- `relation`: reference to another entity

### 3. Dependencies
Dependencies define what the host system must provide.

- **Required dependencies**: block cannot function without them
- **Optional dependencies**: add capabilities, block still functions without them

Standard dependency names:
- `Person`
- `Identity`
- `Payments`
- `Email`
- `Pages`
- `Calendar`

### 4. Events
Define what this block emits and what it listens to.

Event names must use lowercase `entity.action` format.
Examples:
- `contact.created`
- `booking.confirmed`
- `payment.received`
- `course.enrolled`
- `lesson.completed`
- `invoice.paid`

### 5. Pages
Describe the screens the block creates.

Page categories:
- **Admin pages**: authenticated dashboard pages
- **Public pages**: unauthenticated customer-facing pages
- **Integration pages**: additions to existing host pages (for example sections on person details)

For each page, specify:
- Route pattern
- Main content
- User actions
- Empty states
- How `Identity` (soul labels/voice/branding) changes the UX

### 6. Navigation
Define sidebar placement with label, icon, and order.

---

## Complete Example: Courses Block

```markdown
# BLOCK.md: Courses

## Purpose
Courses lets service businesses publish structured learning programs, enroll people, track lesson progress, and automate follow-up.

## Entities

### Course
- title (text)
- slug (text)
- description (long text)
- coverImageUrl (url)
- status (enum: draft, published, archived)
- price (currency)
- createdAt (timestamp, auto)
- updatedAt (timestamp, auto)

### Module
- courseId (relation -> Course)
- title (text)
- sortOrder (integer)

### Lesson
- moduleId (relation -> Module)
- title (text)
- content (rich text)
- videoUrl (url)
- durationMinutes (integer)
- sortOrder (integer)
- isPreview (boolean)

### Enrollment
- courseId (relation -> Course)
- personId (relation -> Person)
- status (enum: pending, active, completed, canceled)
- enrolledAt (timestamp, auto)
- completedAt (timestamp)
- progressPercent (integer)
- metadata (key-value map)

## Dependencies
- Required:
  - Person
  - Identity
- Optional:
  - Payments
  - Email
  - Pages

## Events
- Emits:
  - course.created
  - course.published
  - enrollment.confirmed
  - course.enrolled
  - lesson.completed
  - course.completed
- Listens:
  - payment.received
  - contact.created

## Pages

### Admin pages
1. `/courses`
   - Shows course list with status, enrollments, completion rate
   - Actions: create, publish/unpublish, archive, duplicate
   - Empty state: explain benefits and offer quick create action

2. `/courses/[courseId]`
   - Course builder for modules and lessons
   - Actions: edit details, reorder modules/lessons, preview experience
   - Empty state: start with first module template

3. `/courses/enrollments`
   - Enrollment table with filters and progress
   - Actions: confirm/cancel enrollment, mark complete, resend access
   - Empty state: explain enrollments appear after checkout or manual assignment

### Public pages
1. `/learn/[courseSlug]`
   - Public course sales/overview page
   - Actions: enroll, continue where left off
   - Empty state: if unpublished, show friendly not-available message

2. `/learn/[courseSlug]/lessons/[lessonId]`
   - Lesson viewer with module navigation and completion action
   - Actions: mark complete, move next/previous

### Integration pages
1. Person detail integration
   - Adds "Courses" section to person profile
   - Shows active/completed enrollments and progress
   - Actions: enroll in course, open course record

Identity usage:
- Uses soul entity labels for people naming
- Uses soul tone for student-facing email copy and empty states
- Uses soul branding for page accents and CTA labels

## Navigation
- label: Courses
- icon: GraduationCap
- order: 82
```

---

## How to Install a BLOCK.md

### Developers (self-hosted)
1. Download a BLOCK.md file
2. Open your SeldonFrame repo in an AI coding agent
3. Prompt: "Read this BLOCK.md and implement this block following existing codebase patterns"
4. AI generates schema, actions, pages, events, and integration points
5. Run migration
6. Run build and deploy

### Cloud Pro users
1. Purchase a marketplace block
2. Click install
3. Block is enabled for the org (code already generated and approved)

### Pro Agency users
1. Purchase once
2. Install across client orgs
3. Each org reads its own soul for personalization

---

## Marketplace Generation Lifecycle (v1)

Generated code follows a manual admin merge queue.

1. Seller submits BLOCK.md and clicks "Generate & Preview"
2. AI generates code
3. Code is saved in `generated_blocks` table
4. Block is temporarily enabled only for seller org using generated DB files (not merged codebase files)
5. Seller reviews UX and approves
6. System marks submission approved and sends admin notification
7. Admin reviews generated files in `/admin/blocks/review`
8. Admin clicks Merge
9. Files are committed to codebase and redeploy runs
10. Block status becomes published

No auto-commit without admin review in v1.

---

## How to Create a BLOCK.md

1. Define Purpose
2. Define Entities and field types
3. Declare Dependencies using standard names
4. Define emitted/listened events in `entity.action` format
5. Describe Pages with actions and empty states
6. Test by asking an AI agent to implement it against SeldonFrame
7. Iterate until generated implementation quality is acceptable
8. Submit to marketplace (Pro Agency)

---

## Quality Guidelines

- Use explicit field types, avoid ambiguity
- Use standard dependency names for reliable mapping
- Keep events specific and meaningful
- Include empty states for every page
- Explain how Identity/soul personalizes copy, labels, and branding

---

## Built-in vs Marketplace Blocks

Built-in blocks (CRM, Booking, Landing Pages, Email, Forms, Payments, Automations) are maintained as compiled code by the SeldonFrame team.

Marketplace blocks are generated from BLOCK.md specs and, once approved/published, live in the codebase alongside built-in blocks.

Users should not feel a difference between built-in and marketplace blocks.

Both types:
- Are gated by `org.enabledBlocks`
- Read from soul for personalization
- Communicate through the event bus
- Follow the same design system
