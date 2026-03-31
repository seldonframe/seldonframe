# BLOCK.md: Courses

## Purpose
Courses helps service businesses package expertise into structured learning programs, enroll people, track lesson completion, and automate progress-based follow-up.

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
   - Displays all courses with status, enrollment count, and completion insights
   - Actions: create, publish/unpublish, archive, duplicate
   - Empty state: explain value of courses and offer one-click create

2. `/courses/[courseId]`
   - Builder for modules and lessons
   - Actions: edit details, reorder content, preview learner flow
   - Empty state: starter structure for first module + lesson

3. `/courses/enrollments`
   - Enrollment table with filters for status/progress
   - Actions: confirm/cancel enrollment, mark complete, resend access
   - Empty state: explains how enrollments are created

### Public pages
1. `/learn/[courseSlug]`
   - Public course overview page with enroll/start CTA
   - Empty state: if unpublished, show friendly unavailable message

2. `/learn/[courseSlug]/lessons/[lessonId]`
   - Lesson experience with progress tracking and navigation
   - Actions: mark complete, move next/previous

### Integration pages
1. Person detail integration
   - Adds a "Courses" section on person detail view
   - Shows current and completed enrollments + progress
   - Actions: enroll person, open course details

Identity usage:
- Uses soul labels for person naming
- Uses soul voice for confirmations and helper copy
- Uses soul branding for accents and CTA styling

## Navigation
- label: Courses
- icon: GraduationCap
- order: 82
