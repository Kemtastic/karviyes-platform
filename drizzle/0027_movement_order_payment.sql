ALTER TABLE "fin_movements" ADD COLUMN "order_payment_id" uuid;--> statement-breakpoint
ALTER TABLE fin_movements ADD CONSTRAINT fin_movements_order_payment_fk FOREIGN KEY (company_id, order_payment_id) REFERENCES order_payments(company_id, id);
