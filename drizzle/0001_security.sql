-- Uygulama sorguları bu rolle çalışır; tablo sahibi değildir, RLS'yi aşamaz.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
  EXECUTE format('GRANT app_user TO %I', current_user);
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_user;
--> statement-breakpoint
-- company_id taşıyan her tabloyu firma kapsamına alır. Her göçün sonunda çağrılır; tekrar çağrılması güvenlidir.
CREATE OR REPLACE FUNCTION app_secure_tables() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'company_id'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t.table_name);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t.table_name AND policyname = 'company_scope') THEN
      EXECUTE format(
        'CREATE POLICY company_scope ON %I TO app_user USING (company_id = nullif(current_setting(''app.company_id'', true), '''')::uuid) WITH CHECK (company_id = nullif(current_setting(''app.company_id'', true), '''')::uuid)',
        t.table_name);
    END IF;
    IF t.table_name = 'audit_log' THEN
      EXECUTE format('GRANT SELECT, INSERT ON %I TO app_user', t.table_name);
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM app_user', t.table_name);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t.table_name);
    END IF;
  END LOOP;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
END $$;
--> statement-breakpoint
-- Firma tablosu: uygulama rolü yalnızca kendi firmasını okuyup marka bilgisini güncelleyebilir.
-- FORCE yok: kurulum ve oturum, firma kimliğini slug ile sahip bağlantısından okur.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY company_self ON companies TO app_user
  USING (id = nullif(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.company_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, UPDATE ON companies TO app_user;
--> statement-breakpoint
SELECT app_secure_tables();
