CREATE TABLE "company_settings" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"modules" text[],
	"sector" text,
	"two_factor_roles" text[],
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE company_settings ADD CONSTRAINT company_settings_company_fk FOREIGN KEY (company_id) REFERENCES companies(id);
--> statement-breakpoint
ALTER TABLE company_settings ADD CONSTRAINT company_settings_status_ck CHECK (status IN ('active', 'suspended'));
--> statement-breakpoint
SELECT app_secure_tables();
