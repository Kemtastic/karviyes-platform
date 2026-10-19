CREATE TABLE "fin_staff_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'TRY' NOT NULL,
	"date" date NOT NULL,
	"period" text,
	"movement_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"reversed_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fin_staff_entries_staff_idx" ON "fin_staff_entries" USING btree ("company_id","staff_id","date");--> statement-breakpoint
ALTER TABLE fin_staff_entries ADD CONSTRAINT fin_staff_entries_company_fk FOREIGN KEY (company_id) REFERENCES companies(id);
--> statement-breakpoint
ALTER TABLE fin_staff_entries ADD CONSTRAINT fin_staff_entries_staff_fk FOREIGN KEY (company_id, staff_id) REFERENCES staff(company_id, id);
--> statement-breakpoint
ALTER TABLE fin_staff_entries ADD CONSTRAINT fin_staff_entries_movement_fk FOREIGN KEY (company_id, movement_id) REFERENCES fin_movements(company_id, id);
--> statement-breakpoint
ALTER TABLE fin_staff_entries ADD CONSTRAINT fin_staff_entries_chk CHECK (amount_minor > 0 AND (period IS NULL OR period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$') AND ((kind IN ('advance','payment')) = (movement_id IS NOT NULL)));
--> statement-breakpoint
SELECT app_secure_tables();
