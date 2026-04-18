CREATE TABLE "workspace_secrets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "scope" text DEFAULT 'workspace' NOT NULL,
  "service_name" text NOT NULL,
  "encrypted_value" text NOT NULL,
  "key_version" integer DEFAULT 1 NOT NULL,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone,
  "fingerprint" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_secrets" ADD CONSTRAINT "workspace_secrets_workspace_id_organizations_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workspace_secrets" ADD CONSTRAINT "workspace_secrets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workspace_secrets" ADD CONSTRAINT "workspace_secrets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "workspace_secrets_workspace_idx" ON "workspace_secrets" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX "workspace_secrets_service_idx" ON "workspace_secrets" USING btree ("service_name");
--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_secrets_workspace_scope_service_uidx" ON "workspace_secrets" USING btree ("workspace_id", "scope", "service_name");
