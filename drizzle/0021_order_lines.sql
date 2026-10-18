-- Çok ürünlü sipariş: ürün bilgisi sipariş başlığından order_lines tablosuna taşınır, her iş bir satıra bağlanır.
-- Mevcut her sipariş tek satırlı olur (line_no = 1), iş numarasına "/1" eklenir.
-- Veri kopyalanırken zorunlu satır güvenliği kapatılır (süper kullanıcı olmayan göç rolü satırları görebilsin);
-- sondaki app_secure_tables() yeniden açar.
ALTER TABLE "orders" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "jobs" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"product" jsonb NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"vat_rate" numeric(5, 2) NOT NULL,
	"total_minor" bigint NOT NULL,
	"packaging" jsonb NOT NULL,
	"department_notes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"produced_qty" integer DEFAULT 0 NOT NULL,
	"shipped_qty" integer DEFAULT 0 NOT NULL,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "order_lines_order_no_uq" ON "order_lines" USING btree ("company_id","order_id","line_no");
--> statement-breakpoint
CREATE INDEX "order_lines_status_idx" ON "order_lines" USING btree ("company_id","status");
--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_company_id_uq" UNIQUE ("company_id", "id");
--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_fk" FOREIGN KEY ("company_id", "order_id") REFERENCES "orders"("company_id", "id");
--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_status_ck" CHECK ("status" IN ('open', 'in_production', 'done', 'cancelled'));
--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_qty_ck" CHECK ("line_no" > 0 AND "quantity" > 0 AND "produced_qty" >= 0 AND "shipped_qty" >= 0);
--> statement-breakpoint
INSERT INTO "order_lines" ("company_id", "order_id", "line_no", "product", "quantity", "unit_price", "vat_rate", "total_minor", "packaging", "department_notes", "status", "produced_qty", "shipped_qty", "cancel_reason", "created_at")
SELECT o."company_id", o."id", 1, o."product", o."quantity", o."unit_price", o."vat_rate", o."total_minor", o."packaging", coalesce(o."department_notes", '{}'::jsonb),
  CASE
    WHEN j."id" IS NULL THEN CASE WHEN o."status" = 'cancelled' THEN 'cancelled' ELSE 'open' END
    WHEN j."stage" = 'completed' THEN 'done'
    WHEN j."stage" = 'cancelled' THEN 'cancelled'
    ELSE 'in_production'
  END,
  o."produced_qty", o."shipped_qty", o."cancel_reason", o."created_at"
FROM "orders" o
LEFT JOIN "jobs" j ON j."company_id" = o."company_id" AND j."order_id" = o."id";
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "order_line_id" uuid;
--> statement-breakpoint
UPDATE "jobs" j SET "order_line_id" = l."id", "no" = j."no" || '/1'
FROM "order_lines" l
WHERE l."company_id" = j."company_id" AND l."order_id" = j."order_id" AND l."line_no" = 1;
--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "order_line_id" SET NOT NULL;
--> statement-breakpoint
DROP INDEX "jobs_company_order_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_company_line_uq" ON "jobs" USING btree ("company_id","order_line_id");
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_order_line_fk" FOREIGN KEY ("company_id", "order_line_id") REFERENCES "order_lines"("company_id", "id");
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "product" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "quantity" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "unit_price" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "vat_rate" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "packaging" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "department_notes" DROP NOT NULL;
--> statement-breakpoint
SELECT app_secure_tables();
