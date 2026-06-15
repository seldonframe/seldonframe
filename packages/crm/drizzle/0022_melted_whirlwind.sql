-- Operator Portal PWA v2 — Phase 0.
-- `drizzle-kit generate` also flagged change_plans, onboarding_links, and
-- users.onboarding_completed_at as drift (they were applied to production via
-- `drizzle-kit push` during the onboarding feature, with no migration file, and
-- VERIFIED to already exist in prod). Their CREATE/ALTER statements are omitted
-- here to avoid "relation already exists" failures in db:migrate. The snapshot
-- retains them as the baseline. This migration creates only conversation_notes.
CREATE TABLE "conversation_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"author_email" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_notes_org_contact_idx" ON "conversation_notes" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "conversation_notes_org_created_idx" ON "conversation_notes" USING btree ("org_id","created_at");
