
DO $$ BEGIN PERFORM cron.unschedule('quero-poll-30s-a'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('quero-poll-30s-b'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('quero-poll-5s'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.quero_poll_burst()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  i int;
BEGIN
  FOR i IN 0..11 LOOP
    PERFORM net.http_post(
      url := 'https://kcjrrnxsqdcgjqplgiku.supabase.co/functions/v1/quero-poll',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjanJybnhzcWRjZ2pxcGxnaWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MDI5NDEsImV4cCI6MjA5MzE3ODk0MX0.eZf9mkvQo-RgW403FGSHuKVk7gmCNCSX6deUJZG8yh0"}'::jsonb,
      body := '{}'::jsonb
    );
    IF i < 11 THEN PERFORM pg_sleep(5); END IF;
  END LOOP;
END;
$fn$;

SELECT cron.schedule(
  'quero-poll-5s',
  '* * * * *',
  $$ SELECT public.quero_poll_burst(); $$
);
