ALTER TABLE "order_lines" ADD COLUMN "plate_id" uuid;--> statement-breakpoint
ALTER TABLE "plates" ADD CONSTRAINT "plates_company_id_uq" UNIQUE ("company_id", "id");
--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_plate_fk" FOREIGN KEY ("company_id", "plate_id") REFERENCES "plates"("company_id", "id");
--> statement-breakpoint
SELECT app_secure_tables();
