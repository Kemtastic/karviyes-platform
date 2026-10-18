CREATE TABLE "fin_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"opening_minor" bigint DEFAULT 0 NOT NULL,
	"opening_date" date NOT NULL,
	"bank" text DEFAULT '' NOT NULL,
	"iban" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"party_id" uuid NOT NULL,
	"check_no" text NOT NULL,
	"bank" text NOT NULL,
	"date" date NOT NULL,
	"due" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"endorsed_party_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"party_id" uuid NOT NULL,
	"doc_no" text NOT NULL,
	"date" date NOT NULL,
	"due" date,
	"currency" text NOT NULL,
	"base_minor" bigint NOT NULL,
	"vat_minor" bigint NOT NULL,
	"withholding_minor" bigint DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'recorded' NOT NULL,
	"cancel_note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"direction" text NOT NULL,
	"party_id" uuid,
	"account_id" uuid,
	"amount_minor" bigint NOT NULL,
	"vat_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"date" date NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"check_id" uuid,
	"transfer_group" uuid,
	"reversed_at" timestamp with time zone,
	"reverse_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_openings" (
	"company_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"date" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_openings_company_id_party_id_currency_pk" PRIMARY KEY("company_id","party_id","currency")
);
--> statement-breakpoint
CREATE INDEX "fin_accounts_company_idx" ON "fin_accounts" USING btree ("company_id","archived");--> statement-breakpoint
CREATE INDEX "fin_checks_status_idx" ON "fin_checks" USING btree ("company_id","status","due");--> statement-breakpoint
CREATE INDEX "fin_checks_party_idx" ON "fin_checks" USING btree ("company_id","party_id");--> statement-breakpoint
CREATE INDEX "fin_invoices_party_idx" ON "fin_invoices" USING btree ("company_id","party_id","date");--> statement-breakpoint
CREATE INDEX "fin_invoices_date_idx" ON "fin_invoices" USING btree ("company_id","date");--> statement-breakpoint
CREATE INDEX "fin_movements_party_idx" ON "fin_movements" USING btree ("company_id","party_id","date");--> statement-breakpoint
CREATE INDEX "fin_movements_account_idx" ON "fin_movements" USING btree ("company_id","account_id","date");--> statement-breakpoint
CREATE INDEX "fin_movements_date_idx" ON "fin_movements" USING btree ("company_id","date");--> statement-breakpoint
ALTER TABLE fin_accounts ADD CONSTRAINT fin_accounts_company_id_uq UNIQUE (company_id, id);
--> statement-breakpoint
ALTER TABLE fin_checks ADD CONSTRAINT fin_checks_company_id_uq UNIQUE (company_id, id);
--> statement-breakpoint
ALTER TABLE fin_accounts ADD CONSTRAINT fin_accounts_company_fk FOREIGN KEY (company_id) REFERENCES companies(id);
--> statement-breakpoint
ALTER TABLE fin_accounts ADD CONSTRAINT fin_accounts_kind_ck CHECK (kind IN ('cash', 'bank') AND currency IN ('TRY', 'USD', 'EUR') AND length(trim(name)) > 0);
--> statement-breakpoint
ALTER TABLE fin_invoices ADD CONSTRAINT fin_invoices_party_fk FOREIGN KEY (company_id, party_id) REFERENCES parties(company_id, id);
--> statement-breakpoint
ALTER TABLE fin_invoices ADD CONSTRAINT fin_invoices_values_ck CHECK (kind IN ('sales', 'purchase') AND status IN ('recorded', 'cancelled') AND currency IN ('TRY', 'USD', 'EUR') AND base_minor >= 0 AND vat_minor >= 0 AND withholding_minor >= 0 AND withholding_minor <= vat_minor AND total_minor = base_minor + vat_minor - withholding_minor AND total_minor > 0 AND (due IS NULL OR due >= date));
--> statement-breakpoint
CREATE UNIQUE INDEX fin_invoices_doc_uq ON fin_invoices (company_id, kind, party_id, doc_no) WHERE status = 'recorded';
--> statement-breakpoint
ALTER TABLE fin_movements ADD CONSTRAINT fin_movements_party_fk FOREIGN KEY (company_id, party_id) REFERENCES parties(company_id, id);
--> statement-breakpoint
ALTER TABLE fin_movements ADD CONSTRAINT fin_movements_account_fk FOREIGN KEY (company_id, account_id) REFERENCES fin_accounts(company_id, id);
--> statement-breakpoint
ALTER TABLE fin_movements ADD CONSTRAINT fin_movements_check_fk FOREIGN KEY (company_id, check_id) REFERENCES fin_checks(company_id, id);
--> statement-breakpoint
ALTER TABLE fin_movements ADD CONSTRAINT fin_movements_values_ck CHECK (direction IN ('in', 'out') AND currency IN ('TRY', 'USD', 'EUR') AND amount_minor > 0 AND vat_minor >= 0 AND vat_minor <= amount_minor AND (party_id IS NOT NULL OR account_id IS NOT NULL));
--> statement-breakpoint
ALTER TABLE fin_checks ADD CONSTRAINT fin_checks_party_fk FOREIGN KEY (company_id, party_id) REFERENCES parties(company_id, id);
--> statement-breakpoint
ALTER TABLE fin_checks ADD CONSTRAINT fin_checks_endorsed_fk FOREIGN KEY (company_id, endorsed_party_id) REFERENCES parties(company_id, id);
--> statement-breakpoint
ALTER TABLE fin_checks ADD CONSTRAINT fin_checks_values_ck CHECK (direction IN ('received', 'issued') AND currency IN ('TRY', 'USD', 'EUR') AND amount_minor > 0 AND due >= date AND length(trim(check_no)) > 0);
--> statement-breakpoint
CREATE UNIQUE INDEX fin_checks_no_uq ON fin_checks (company_id, direction, bank, check_no) WHERE status NOT IN ('returned', 'cancelled');
--> statement-breakpoint
ALTER TABLE fin_openings ADD CONSTRAINT fin_openings_party_fk FOREIGN KEY (company_id, party_id) REFERENCES parties(company_id, id);
--> statement-breakpoint
SELECT app_secure_tables();
