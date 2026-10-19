CREATE TABLE "platform_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" text NOT NULL,
	"target_company_id" uuid NOT NULL,
	"role" text NOT NULL,
	"reason" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "platform_views" ADD CONSTRAINT "platform_views_target_company_id_companies_id_fk" FOREIGN KEY ("target_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_views_admin_idx" ON "platform_views" USING btree ("admin_user_id","expires_at");--> statement-breakpoint
ALTER TABLE platform_views ADD CONSTRAINT platform_views_admin_fk FOREIGN KEY (admin_user_id) REFERENCES "user"(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE platform_views ADD CONSTRAINT platform_views_reason_chk CHECK (length(trim(reason)) >= 10 AND expires_at > started_at AND expires_at <= started_at + interval '2 hours');
--> statement-breakpoint
-- Merkez panel tablosu: uygulama rolüne kapalı, satır güvenliği açık ve politikasız (yalnız sahip bağlantısı).
REVOKE ALL ON platform_views FROM app_user;
--> statement-breakpoint
ALTER TABLE platform_views ENABLE ROW LEVEL SECURITY;
