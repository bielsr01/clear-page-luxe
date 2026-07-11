
CREATE TYPE public.support_ticket_status AS ENUM ('open','in_progress','completed');

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject text NOT NULL,
  description text NOT NULL,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.support_ticket_status NOT NULL DEFAULT 'open',
  admin_notes text,
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  in_progress_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_tickets_restaurant_idx ON public.support_tickets(restaurant_id, created_at DESC);
CREATE INDEX support_tickets_status_idx ON public.support_tickets(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers view own restaurant tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (
    public.is_restaurant_manager(auth.uid(), restaurant_id)
    OR public.has_role(auth.uid(), 'master_admin'::app_role)
  );

CREATE POLICY "Managers create tickets for own restaurant"
  ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.is_restaurant_manager(auth.uid(), restaurant_id)
      OR public.has_role(auth.uid(), 'master_admin'::app_role)
    )
  );

CREATE POLICY "Managers update own open tickets, admins any"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'master_admin'::app_role)
    OR (public.is_restaurant_manager(auth.uid(), restaurant_id) AND status = 'open')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'master_admin'::app_role)
    OR public.is_restaurant_manager(auth.uid(), restaurant_id)
  );

CREATE POLICY "Admins delete tickets"
  ON public.support_tickets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER support_tickets_touch_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
