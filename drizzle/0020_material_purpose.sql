ALTER TABLE "fabric_rolls" ADD COLUMN "reserved_for" text;--> statement-breakpoint
UPDATE "fabric_rolls" SET "reserved_for" = 'fabric' WHERE "reserved_job_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "fabric_rolls" ADD CONSTRAINT "fabric_rolls_reserved_for_ck" CHECK ("reserved_for" IN ('fabric', 'handle'));
--> statement-breakpoint
SELECT app_secure_tables();
