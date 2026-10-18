CREATE TABLE "order_counters" (
	"company_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"next" integer NOT NULL,
	CONSTRAINT "order_counters_company_id_year_pk" PRIMARY KEY("company_id","year")
);
--> statement-breakpoint
CREATE TABLE "order_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"paid_at" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"corrects_payment_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"no" text NOT NULL,
	"party_id" uuid NOT NULL,
	"salesperson_staff_id" uuid,
	"order_date" date NOT NULL,
	"product" jsonb NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"vat_rate" numeric(5, 2) NOT NULL,
	"currency" text NOT NULL,
	"fx_rate" numeric(18, 6),
	"fx_rate_date" date,
	"fx_source" text,
	"total_minor" bigint NOT NULL,
	"packaging" jsonb NOT NULL,
	"department_notes" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"invoice_mark" jsonb,
	"produced_qty" integer DEFAULT 0 NOT NULL,
	"shipped_qty" integer DEFAULT 0 NOT NULL,
	"cancel_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "order_payments_order_idx" ON "order_payments" USING btree ("company_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_company_no_uq" ON "orders" USING btree ("company_id","no");--> statement-breakpoint
CREATE INDEX "orders_company_status_idx" ON "orders" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "orders_party_idx" ON "orders" USING btree ("company_id","party_id");