-- Veri bütünlüğü: yabancı anahtarlar (firma + kayıt birlikte, böylece bir firma başka firmanın kaydına bağlanamaz)
-- ve değer kısıtları. Yabancı anahtar denetimi tablo sahibi yetkisiyle ve RLS'den bağımsız çalışır.
ALTER TABLE parties ADD CONSTRAINT parties_company_id_uq UNIQUE (company_id, id);
--> statement-breakpoint
ALTER TABLE staff ADD CONSTRAINT staff_company_id_uq UNIQUE (company_id, id);
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_company_id_uq UNIQUE (company_id, id);
--> statement-breakpoint
ALTER TABLE order_payments ADD CONSTRAINT order_payments_company_id_uq UNIQUE (company_id, id);
--> statement-breakpoint
ALTER TABLE jobs ADD CONSTRAINT jobs_company_id_uq UNIQUE (company_id, id);
--> statement-breakpoint
ALTER TABLE parties ADD CONSTRAINT parties_company_fk FOREIGN KEY (company_id) REFERENCES companies(id);
--> statement-breakpoint
ALTER TABLE staff ADD CONSTRAINT staff_company_fk FOREIGN KEY (company_id) REFERENCES companies(id);
--> statement-breakpoint
ALTER TABLE memberships ADD CONSTRAINT memberships_company_fk FOREIGN KEY (company_id) REFERENCES companies(id);
--> statement-breakpoint
ALTER TABLE memberships ADD CONSTRAINT memberships_user_fk FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE memberships ADD CONSTRAINT memberships_staff_fk FOREIGN KEY (company_id, staff_id) REFERENCES staff(company_id, id);
--> statement-breakpoint
ALTER TABLE invites ADD CONSTRAINT invites_company_fk FOREIGN KEY (company_id) REFERENCES companies(id);
--> statement-breakpoint
ALTER TABLE files ADD CONSTRAINT files_company_fk FOREIGN KEY (company_id) REFERENCES companies(id);
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_party_fk FOREIGN KEY (company_id, party_id) REFERENCES parties(company_id, id);
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_salesperson_fk FOREIGN KEY (company_id, salesperson_staff_id) REFERENCES staff(company_id, id);
--> statement-breakpoint
ALTER TABLE order_payments ADD CONSTRAINT order_payments_order_fk FOREIGN KEY (company_id, order_id) REFERENCES orders(company_id, id);
--> statement-breakpoint
ALTER TABLE order_payments ADD CONSTRAINT order_payments_corrects_fk FOREIGN KEY (company_id, corrects_payment_id) REFERENCES order_payments(company_id, id);
--> statement-breakpoint
ALTER TABLE order_counters ADD CONSTRAINT order_counters_company_fk FOREIGN KEY (company_id) REFERENCES companies(id);
--> statement-breakpoint
ALTER TABLE jobs ADD CONSTRAINT jobs_order_fk FOREIGN KEY (company_id, order_id) REFERENCES orders(company_id, id);
--> statement-breakpoint
ALTER TABLE job_events ADD CONSTRAINT job_events_job_fk FOREIGN KEY (company_id, job_id) REFERENCES jobs(company_id, id);
--> statement-breakpoint
ALTER TABLE shipments ADD CONSTRAINT shipments_job_fk FOREIGN KEY (company_id, job_id) REFERENCES jobs(company_id, id);
--> statement-breakpoint
ALTER TABLE fabric_rolls ADD CONSTRAINT fabric_rolls_job_fk FOREIGN KEY (company_id, reserved_job_id) REFERENCES jobs(company_id, id);
--> statement-breakpoint
ALTER TABLE plates ADD CONSTRAINT plates_party_fk FOREIGN KEY (company_id, party_id) REFERENCES parties(company_id, id);
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_status_ck CHECK (status IN ('draft', 'in_production', 'ready_to_invoice', 'invoiced', 'cancelled'));
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_currency_ck CHECK (currency IN ('TRY', 'USD', 'EUR'));
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_quantity_ck CHECK (quantity > 0);
--> statement-breakpoint
ALTER TABLE order_payments ADD CONSTRAINT order_payments_kind_ck CHECK (kind IN ('deposit', 'payment', 'correction'));
--> statement-breakpoint
ALTER TABLE order_payments ADD CONSTRAINT order_payments_currency_ck CHECK (currency IN ('TRY', 'USD', 'EUR'));
--> statement-breakpoint
ALTER TABLE jobs ADD CONSTRAINT jobs_stage_status_ck CHECK (stage_status IN ('waiting', 'in_progress'));
--> statement-breakpoint
ALTER TABLE jobs ADD CONSTRAINT jobs_qty_ck CHECK (produced_qty >= 0 AND shipped_qty >= 0 AND shipped_qty <= produced_qty);
--> statement-breakpoint
ALTER TABLE fabric_rolls ADD CONSTRAINT fabric_rolls_status_ck CHECK (status IN ('available', 'reserved', 'used'));
--> statement-breakpoint
ALTER TABLE memberships ADD CONSTRAINT memberships_kind_ck CHECK (kind IN ('person', 'device'));
--> statement-breakpoint
SELECT app_secure_tables();
