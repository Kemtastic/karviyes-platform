CREATE TABLE "platform_admins" (
	"user_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_company_id" uuid,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "platform_audit_at_idx" ON "platform_audit" USING btree ("at");--> statement-breakpoint
CREATE INDEX "platform_audit_company_idx" ON "platform_audit" USING btree ("target_company_id","at");--> statement-breakpoint
ALTER TABLE platform_admins ADD CONSTRAINT platform_admins_user_fk FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
--> statement-breakpoint
-- Firma kapsamındaki uygulama rolü merkez panel tablolarına hiç erişemez.
REVOKE ALL ON platform_admins, platform_audit FROM app_user;
--> statement-breakpoint
-- Satır güvenliği açık, politika yok: Supabase anon/authenticated ve app_user hiçbir satır göremez; yalnız sahip bağlantısı (merkez panel) erişir.
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_audit ENABLE ROW LEVEL SECURITY;
