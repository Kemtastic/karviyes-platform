CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"legal_type" text DEFAULT 'company' NOT NULL,
	"tax_id" text DEFAULT '' NOT NULL,
	"tax_office" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"district" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"search_key" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "parties_company_search_idx" ON "parties" USING btree ("company_id","search_key");--> statement-breakpoint
CREATE UNIQUE INDEX "parties_company_tax_uq" ON "parties" USING btree ("company_id","tax_id") WHERE "parties"."archived" = false and "parties"."tax_id" <> '';