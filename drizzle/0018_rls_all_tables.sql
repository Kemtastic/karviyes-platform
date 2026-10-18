-- Supabase gibi tabloları otomatik API ile açan barındırmalarda veri sızmasın diye:
-- company_id taşıyan tablolar zorunlu RLS + firma politikası alır (önceki gibi);
-- diğer tüm tablolarda RLS açılır ama zorunlu kılınmaz: sahip bağlantısı (uygulama, Better Auth) çalışır,
-- politikası olmayan roller (anon, authenticated) hiçbir satır göremez.
CREATE OR REPLACE FUNCTION app_secure_tables() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  t record;
  r text;
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

  FOR t IN
    SELECT c.relname AS table_name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
  END LOOP;

  -- Supabase rolleri varsa public şemasından tamamen uzaklaştırılır.
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
    END IF;
  END LOOP;

  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
END $$;
--> statement-breakpoint
SELECT app_secure_tables();
