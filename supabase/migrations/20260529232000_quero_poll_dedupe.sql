ALTER TABLE public.quero_events
  ADD COLUMN IF NOT EXISTS event_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quero_events_integration_event_key
  ON public.quero_events(integration_id, event_key)
  WHERE event_key IS NOT NULL;

ALTER TABLE public.quero_integrations
  ADD COLUMN IF NOT EXISTS last_reconcile_at timestamptz;
