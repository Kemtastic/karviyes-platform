ALTER TABLE "invites" ADD COLUMN "failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
SELECT app_secure_tables();
