
ALTER TABLE public.quero_events ADD COLUMN IF NOT EXISTS event_key text;

-- Preenche event_key para linhas antigas (usa id como fallback) para permitir o índice único.
UPDATE public.quero_events SET event_key = id::text WHERE event_key IS NULL;

ALTER TABLE public.quero_events ALTER COLUMN event_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS quero_events_integration_event_key_uidx
  ON public.quero_events (integration_id, event_key);
