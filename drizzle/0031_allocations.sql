CREATE TABLE "fin_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fin_allocations_invoice_idx" ON "fin_allocations" USING btree ("company_id","invoice_id");--> statement-breakpoint
CREATE INDEX "fin_allocations_movement_idx" ON "fin_allocations" USING btree ("company_id","movement_id");--> statement-breakpoint
ALTER TABLE fin_invoices ADD CONSTRAINT fin_invoices_company_id_uq UNIQUE (company_id, id);
--> statement-breakpoint
ALTER TABLE fin_movements ADD CONSTRAINT fin_movements_company_id_uq UNIQUE (company_id, id);
--> statement-breakpoint
ALTER TABLE fin_allocations ADD CONSTRAINT fin_allocations_movement_fk FOREIGN KEY (company_id, movement_id) REFERENCES fin_movements(company_id, id);
--> statement-breakpoint
ALTER TABLE fin_allocations ADD CONSTRAINT fin_allocations_invoice_fk FOREIGN KEY (company_id, invoice_id) REFERENCES fin_invoices(company_id, id);
--> statement-breakpoint
ALTER TABLE fin_allocations ADD CONSTRAINT fin_allocations_amount_ck CHECK (amount_minor > 0);
--> statement-breakpoint
SELECT app_secure_tables();
