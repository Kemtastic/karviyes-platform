CREATE TABLE "sales_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text NOT NULL,
	"next_date" date,
	"created_by" text NOT NULL,
	"staff_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sales_contacts" (
	"company_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"responsible_staff_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_contacts_company_id_party_id_pk" PRIMARY KEY("company_id","party_id")
);
--> statement-breakpoint
CREATE INDEX "sales_calls_party_idx" ON "sales_calls" USING btree ("company_id","party_id","at");--> statement-breakpoint
CREATE INDEX "sales_contacts_staff_idx" ON "sales_contacts" USING btree ("company_id","responsible_staff_id");--> statement-breakpoint
ALTER TABLE "sales_calls" ADD CONSTRAINT "sales_calls_party_fk" FOREIGN KEY ("company_id", "party_id") REFERENCES "parties"("company_id", "id");
--> statement-breakpoint
ALTER TABLE "sales_calls" ADD CONSTRAINT "sales_calls_staff_fk" FOREIGN KEY ("company_id", "staff_id") REFERENCES "staff"("company_id", "id");
--> statement-breakpoint
ALTER TABLE "sales_calls" ADD CONSTRAINT "sales_calls_note_ck" CHECK (length(trim("note")) > 0);
--> statement-breakpoint
ALTER TABLE "sales_contacts" ADD CONSTRAINT "sales_contacts_party_fk" FOREIGN KEY ("company_id", "party_id") REFERENCES "parties"("company_id", "id");
--> statement-breakpoint
ALTER TABLE "sales_contacts" ADD CONSTRAINT "sales_contacts_staff_fk" FOREIGN KEY ("company_id", "responsible_staff_id") REFERENCES "staff"("company_id", "id");
--> statement-breakpoint
SELECT app_secure_tables();
