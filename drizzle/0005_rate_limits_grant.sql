-- Hız sınırı sayacı firmalar arası değil, kullanıcı anahtarlıdır; uygulama rolü okuyup yazabilir.
GRANT SELECT, INSERT, UPDATE ON rate_limits TO app_user;
--> statement-breakpoint
SELECT app_secure_tables();
