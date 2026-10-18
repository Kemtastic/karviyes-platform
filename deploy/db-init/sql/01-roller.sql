-- Uygulama ve göçler için süper kullanıcı OLMAYAN sahip rolü. Yalnızca veritabanı ilk oluşturulurken çalışır
-- (../00-roller.sh). Süper kullanıcı (POSTGRES_USER) yalnızca yedek ve bakım içindir.
CREATE ROLE uretim_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'uygulama_parolasi';

-- Firma kapsamlı sorguların geçtiği rol; göç 0001 de oluşturur ama süper kullanıcı olmayan rol rol oluşturamaz.
CREATE ROLE app_user NOLOGIN;
GRANT app_user TO uretim_app WITH ADMIN OPTION;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT, CREATE ON DATABASE %I TO uretim_app', current_database());
END $$;

GRANT USAGE, CREATE ON SCHEMA public TO uretim_app;
