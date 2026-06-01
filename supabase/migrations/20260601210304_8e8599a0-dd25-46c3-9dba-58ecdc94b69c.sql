
-- Add missing column used by quero-poll reconciliation
ALTER TABLE public.quero_integrations
  ADD COLUMN IF NOT EXISTS last_reconcile_at timestamptz;

-- Schedule automatic polling of Quero Delivery every 30 seconds.
-- pg_cron min granularity is 1 minute, so we schedule two jobs offset by 30s.
DO $$
BEGIN
  PERFORM cron.unschedule('quero-poll-30s-a');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('quero-poll-30s-b');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'quero-poll-30s-a',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kcjrrnxsqdcgjqplgiku.supabase.co/functions/v1/quero-poll',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjanJybnhzcWRjZ2pxcGxnaWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MDI5NDEsImV4cCI6MjA5MzE3ODk0MX0.eZf9mkvQo-RgW403FGSHuKVk7gmCNCSX6deUJZG8yh0"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'quero-poll-30s-b',
  '* * * * *',
  $$
  SELECT pg_sleep(30);
  SELECT net.http_post(
    url := 'https://kcjrrnxsqdcgjqplgiku.supabase.co/functions/v1/quero-poll',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjanJybnhzcWRjZ2pxcGxnaWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MDI5NDEsImV4cCI6MjA5MzE3ODk0MX0.eZf9mkvQo-RgW403FGSHuKVk7gmCNCSX6deUJZG8yh0"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
