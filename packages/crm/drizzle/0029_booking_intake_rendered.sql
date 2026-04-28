-- Wiring task — `bookings` and `intake_forms` get rendered HTML/CSS
-- columns so the public /book and /intake routes can serve the C4 +
-- C5 blueprint output the same way `landing_pages.content_html` /
-- `content_css` already drive `/s/<slug>/<page>` post-C3.
--
-- Without these, the public booking / intake routes still render the
-- pre-blueprint React components (`PublicBookingForm`, `PublicForm`)
-- and operators see the polished blueprint landing followed by a
-- jarringly plain booking step.
--
-- Both columns are nullable so existing rows continue to work via the
-- legacy React fallback in the route handlers. Workspaces created
-- after this ships get them populated at seed time
-- (createDefaultBookingTemplate, createDefaultIntakeForm), and a
-- one-shot backfill script fills the rest.
--
-- Additive only; no changes to existing columns or indexes.

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "content_html" text,
  ADD COLUMN IF NOT EXISTS "content_css" text;

COMMENT ON COLUMN "bookings"."content_html" IS
  'Pre-rendered HTML from calcom-month-v1 blueprint renderer for template rows (status=template). NULL for legacy rows or scheduled-booking rows -- route handler falls back to PublicBookingForm React component.';

COMMENT ON COLUMN "bookings"."content_css" IS
  'Pre-rendered CSS that pairs with content_html. Always set together.';

ALTER TABLE "intake_forms"
  ADD COLUMN IF NOT EXISTS "content_html" text,
  ADD COLUMN IF NOT EXISTS "content_css" text;

COMMENT ON COLUMN "intake_forms"."content_html" IS
  'Pre-rendered HTML from formbricks-stack-v1 blueprint renderer. NULL for legacy rows -- route handler falls back to PublicForm React component.';

COMMENT ON COLUMN "intake_forms"."content_css" IS
  'Pre-rendered CSS that pairs with content_html. Always set together.';
