ALTER TABLE "sales_contacts" ADD COLUMN "priority" text DEFAULT 'B' NOT NULL;--> statement-breakpoint
ALTER TABLE sales_contacts ADD CONSTRAINT sales_contacts_priority_chk CHECK (priority IN ('A','B','C'));
