CREATE TABLE "fabric_rolls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"width_cm" numeric(8, 2) NOT NULL,
	"colour" text NOT NULL,
	"gsm" integer NOT NULL,
	"metres" integer NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"reserved_job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"staff_ids" uuid[] DEFAULT '{}' NOT NULL,
	"machine" text DEFAULT '' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"no" text NOT NULL,
	"stage" text DEFAULT 'waiting' NOT NULL,
	"stage_status" text DEFAULT 'waiting' NOT NULL,
	"fabric_reserved" boolean DEFAULT false NOT NULL,
	"produced_qty" integer DEFAULT 0 NOT NULL,
	"shipped_qty" integer DEFAULT 0 NOT NULL,
	"review_note" text DEFAULT '' NOT NULL,
	"cancel_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"shipped_at" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fabric_rolls_status_idx" ON "fabric_rolls" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "job_events_job_idx" ON "job_events" USING btree ("company_id","job_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_company_order_uq" ON "jobs" USING btree ("company_id","order_id");--> statement-breakpoint
CREATE INDEX "jobs_company_stage_idx" ON "jobs" USING btree ("company_id","stage");--> statement-breakpoint
CREATE INDEX "shipments_job_idx" ON "shipments" USING btree ("company_id","job_id");