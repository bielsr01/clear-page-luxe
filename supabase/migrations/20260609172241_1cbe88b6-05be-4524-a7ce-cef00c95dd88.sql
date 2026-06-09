CREATE OR REPLACE FUNCTION public.quero_poll_burst()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  i int;
BEGIN
  FOR i IN 0..58 LOOP
    PERFORM net.http_post(
      url := 'https://yltsrnmzlsxfdgnrsbio.supabase.co/functions/v1/quero-poll',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsdHNybm16bHN4ZmRnbnJzYmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNDk3MDUsImV4cCI6MjA5NDYyNTcwNX0.wtwgoMUSBdur54M3O6q_UvbPGVFJA6R0JrKadK272V8"}'::jsonb,
      body := '{}'::jsonb
    );
    IF i < 58 THEN PERFORM pg_sleep(1); END IF;
  END LOOP;
END;
$function$;