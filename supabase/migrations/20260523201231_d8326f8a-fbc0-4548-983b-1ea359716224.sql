CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing schedule if it exists
DO $$
DECLARE _jid bigint;
BEGIN
  SELECT jobid INTO _jid FROM cron.job WHERE jobname = 'auto-store-hours-every-minute';
  IF _jid IS NOT NULL THEN PERFORM cron.unschedule(_jid); END IF;
END $$;

SELECT cron.schedule(
  'auto-store-hours-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://yltsrnmzlsxfdgnrsbio.supabase.co/functions/v1/auto-store-hours',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdHNybm16bHN4ZmRnbnJzYmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNDk3MDUsImV4cCI6MjA5NDYyNTcwNX0.wtwgoMUSBdur54M3O6q_UvbPGVFJA6R0JrKadK272V8"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);