CREATE TABLE "fin_settings" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"locked_until" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "fin_invoices" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN "source" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE fin_invoices DROP CONSTRAINT fin_invoices_values_ck;
--> statement-breakpoint
ALTER TABLE fin_invoices ADD CONSTRAINT fin_invoices_values_ck CHECK (kind IN ('sales', 'purchase', 'sales_return', 'purchase_return') AND status IN ('recorded', 'cancelled') AND currency IN ('TRY', 'USD', 'EUR') AND base_minor >= 0 AND vat_minor >= 0 AND withholding_minor >= 0 AND withholding_minor <= vat_minor AND total_minor = base_minor + vat_minor - withholding_minor AND total_minor > 0 AND (due IS NULL OR due >= date));
--> statement-breakpoint
ALTER TABLE fin_invoices ADD CONSTRAINT fin_invoices_order_fk FOREIGN KEY (company_id, order_id) REFERENCES orders(company_id, id);
--> statement-breakpoint
ALTER TABLE fin_settings ADD CONSTRAINT fin_settings_company_fk FOREIGN KEY (company_id) REFERENCES companies(id);
--> statement-breakpoint
SELECT app_secure_tables();
