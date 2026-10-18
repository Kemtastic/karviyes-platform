CREATE TABLE "fin_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"no" text NOT NULL,
	"party_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"as_of" date NOT NULL,
	"balance_minor" bigint NOT NULL,
	"snapshot" jsonb NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"token_hash" text,
	"token_expires_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"response" jsonb,
	"responded_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fin_reconciliations_party_idx" ON "fin_reconciliations" USING btree ("company_id","party_id","as_of");--> statement-breakpoint
CREATE INDEX "fin_reconciliations_status_idx" ON "fin_reconciliations" USING btree ("company_id","status");--> statement-breakpoint
ALTER TABLE fin_reconciliations ADD CONSTRAINT fin_reconciliations_party_fk FOREIGN KEY (company_id, party_id) REFERENCES parties(company_id, id);
--> statement-breakpoint
ALTER TABLE fin_reconciliations ADD CONSTRAINT fin_reconciliations_values_ck CHECK (currency IN ('TRY', 'USD', 'EUR') AND status IN ('draft', 'pending', 'agreed', 'disputed', 'cancelled'));
--> statement-breakpoint
CREATE UNIQUE INDEX fin_reconciliations_no_uq ON fin_reconciliations (company_id, no);
--> statement-breakpoint
SELECT app_secure_tables();
