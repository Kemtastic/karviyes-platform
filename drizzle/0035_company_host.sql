ALTER TABLE "companies" ADD COLUMN "host" text;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_host_unique" UNIQUE("host");--> statement-breakpoint
ALTER TABLE companies ADD CONSTRAINT companies_host_ck CHECK (host IS NULL OR host ~ '^[a-z0-9.-]+$');
