CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Rodar o polling do Quero em segundo plano, mesmo com o painel fechado.
-- Dois jobs por minuto, em sequência, para aproximar a atualização de tempo real.
DO $$
DECLARE
  _jid bigint;
BEGIN
  FOR _jid IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'quero-poll-30s-a',
      'quero-poll-30s-b'
    )
  LOOP
    PERFORM cron.unschedule(_jid);
  END LOOP;
END $$;

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
