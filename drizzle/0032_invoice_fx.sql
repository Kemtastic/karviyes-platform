ALTER TABLE "fin_invoices" ADD COLUMN "fx_rate" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "fin_invoices" ADD COLUMN "fx_rate_date" date;