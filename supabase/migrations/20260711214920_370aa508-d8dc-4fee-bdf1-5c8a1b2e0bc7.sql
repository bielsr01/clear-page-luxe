
CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('admin','manager')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_ticket_messages_ticket_idx ON public.support_ticket_messages(ticket_id, created_at);

GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View ticket messages"
ON public.support_ticket_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = ticket_id
    AND (
      public.is_restaurant_manager(auth.uid(), t.restaurant_id)
      OR public.has_role(auth.uid(), 'master_admin'::app_role)
    )
  )
);

CREATE POLICY "Send ticket messages"
ON public.support_ticket_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = ticket_id
    AND (
      (sender_role = 'manager' AND public.is_restaurant_manager(auth.uid(), t.restaurant_id))
      OR (sender_role = 'admin' AND public.has_role(auth.uid(), 'master_admin'::app_role))
    )
  )
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;
