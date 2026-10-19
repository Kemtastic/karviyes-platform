CREATE TABLE "fin_recurring" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"direction" text DEFAULT 'out' NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"category" text NOT NULL,
	"day_of_month" integer NOT NULL,
	"start_month" text NOT NULL,
	"end_month" text,
	"last_posted_month" text,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fin_recurring_company_idx" ON "fin_recurring" USING btree ("company_id","active");--> statement-breakpoint
ALTER TABLE fin_recurring ADD CONSTRAINT fin_recurring_company_fk FOREIGN KEY (company_id) REFERENCES companies(id);
--> statement-breakpoint
ALTER TABLE fin_recurring ADD CONSTRAINT fin_recurring_account_fk FOREIGN KEY (company_id, account_id) REFERENCES fin_accounts(company_id, id);
--> statement-breakpoint
ALTER TABLE fin_recurring ADD CONSTRAINT fin_recurring_chk CHECK (amount_minor > 0 AND day_of_month BETWEEN 1 AND 28 AND vat_rate BETWEEN 0 AND 100 AND start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND (end_month IS NULL OR (end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND end_month >= start_month)) AND (last_posted_month IS NULL OR last_posted_month >= start_month) AND length(trim(name)) > 0);
--> statement-breakpoint
SELECT app_secure_tables();
