CREATE TABLE "email_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "email_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "provider" text DEFAULT 'resend' NOT NULL,
  "provider_event_id" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "email_events_org_email_idx" ON "email_events" USING btree ("org_id", "email_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "email_events_org_type_idx" ON "email_events" USING btree ("org_id", "event_type", "created_at" DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX "email_events_provider_event_uidx" ON "email_events" USING btree ("provider", "provider_event_id");
--> statement-breakpoint

CREATE TABLE "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "contact_id" uuid NOT NULL,
  "channel" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "subject" text,
  "assistant_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_turn_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "conversations_org_contact_idx" ON "conversations" USING btree ("org_id", "contact_id");
--> statement-breakpoint
CREATE INDEX "conversations_org_status_last_turn_idx" ON "conversations" USING btree ("org_id", "status", "last_turn_at" DESC);
--> statement-breakpoint

CREATE TABLE "conversation_turns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "direction" text NOT NULL,
  "channel" text NOT NULL,
  "content" text NOT NULL,
  "email_id" uuid,
  "sms_message_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "conversation_turns_org_conv_created_idx" ON "conversation_turns" USING btree ("org_id", "conversation_id", "created_at");
--> statement-breakpoint
CREATE INDEX "conversation_turns_org_created_idx" ON "conversation_turns" USING btree ("org_id", "created_at" DESC);
--> statement-breakpoint

CREATE TABLE "suppression_list" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "email" text NOT NULL,
  "reason" text DEFAULT 'manual' NOT NULL,
  "source" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suppression_list" ADD CONSTRAINT "suppression_list_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_list_org_email_uidx" ON "suppression_list" USING btree ("org_id", "email");
--> statement-breakpoint
CREATE INDEX "suppression_list_org_created_idx" ON "suppression_list" USING btree ("org_id", "created_at" DESC);
