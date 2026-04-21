CREATE TABLE "sms_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "contact_id" uuid,
  "user_id" uuid,
  "provider" text DEFAULT 'twilio' NOT NULL,
  "direction" text DEFAULT 'outbound' NOT NULL,
  "from_number" text NOT NULL,
  "to_number" text NOT NULL,
  "body" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "external_message_id" text,
  "error_code" text,
  "error_message" text,
  "segments" integer DEFAULT 1 NOT NULL,
  "sent_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "sms_messages_org_created_idx" ON "sms_messages" USING btree ("org_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "sms_messages_org_contact_idx" ON "sms_messages" USING btree ("org_id", "contact_id");
--> statement-breakpoint
CREATE INDEX "sms_messages_org_status_idx" ON "sms_messages" USING btree ("org_id", "status");
--> statement-breakpoint
CREATE INDEX "sms_messages_org_direction_idx" ON "sms_messages" USING btree ("org_id", "direction");
--> statement-breakpoint

CREATE TABLE "sms_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "sms_message_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "provider" text DEFAULT 'twilio' NOT NULL,
  "provider_event_id" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sms_events" ADD CONSTRAINT "sms_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sms_events" ADD CONSTRAINT "sms_events_sms_message_id_sms_messages_id_fk" FOREIGN KEY ("sms_message_id") REFERENCES "public"."sms_messages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "sms_events_org_msg_idx" ON "sms_events" USING btree ("org_id", "sms_message_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "sms_events_org_type_idx" ON "sms_events" USING btree ("org_id", "event_type", "created_at" DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX "sms_events_provider_event_uidx" ON "sms_events" USING btree ("provider", "provider_event_id");
--> statement-breakpoint

-- Extend suppression_list for multi-channel opt-outs.
-- Drop the notNull from email since SMS suppressions use phone instead.
-- The existing unique(org_id, email) index still works — NULL phones
-- are treated as distinct by Postgres unique indexes.
ALTER TABLE "suppression_list" ALTER COLUMN "email" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "suppression_list" ADD COLUMN "channel" text DEFAULT 'email' NOT NULL;
--> statement-breakpoint
ALTER TABLE "suppression_list" ADD COLUMN "phone" text;
--> statement-breakpoint
ALTER TABLE "suppression_list" ADD CONSTRAINT "suppression_list_identifier_chk" CHECK (
  ("email" IS NOT NULL AND "phone" IS NULL) OR ("email" IS NULL AND "phone" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_list_org_phone_uidx" ON "suppression_list" USING btree ("org_id", "phone");
--> statement-breakpoint
CREATE INDEX "suppression_list_org_channel_idx" ON "suppression_list" USING btree ("org_id", "channel");
