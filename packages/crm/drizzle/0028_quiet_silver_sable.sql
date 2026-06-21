ALTER TABLE "deployments" ADD COLUMN "client_org_id" uuid;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "portal_invited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_client_org_id_organizations_id_fk" FOREIGN KEY ("client_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
