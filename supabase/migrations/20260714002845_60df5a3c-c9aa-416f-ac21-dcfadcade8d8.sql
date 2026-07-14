
CREATE TABLE public.crm_task_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  task_key text NOT NULL,
  template text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, task_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_task_messages TO authenticated;
GRANT ALL ON public.crm_task_messages TO service_role;
ALTER TABLE public.crm_task_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_msg manage"
  ON public.crm_task_messages FOR ALL
  USING (public.has_role(auth.uid(), 'master_admin'::app_role) OR public.is_restaurant_manager(auth.uid(), restaurant_id))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role) OR public.is_restaurant_manager(auth.uid(), restaurant_id));
CREATE TRIGGER trg_crm_task_messages_updated BEFORE UPDATE ON public.crm_task_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.crm_task_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  task_key text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  reference_date date NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, task_key, customer_id, reference_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_task_sends TO authenticated;
GRANT ALL ON public.crm_task_sends TO service_role;
ALTER TABLE public.crm_task_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_sends manage"
  ON public.crm_task_sends FOR ALL
  USING (public.has_role(auth.uid(), 'master_admin'::app_role) OR public.is_restaurant_manager(auth.uid(), restaurant_id))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role) OR public.is_restaurant_manager(auth.uid(), restaurant_id));
CREATE TRIGGER trg_crm_task_sends_updated BEFORE UPDATE ON public.crm_task_sends
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_crm_sends_lookup ON public.crm_task_sends(restaurant_id, task_key, reference_date);

CREATE TABLE public.crm_admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notify_template text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_admin_settings TO authenticated;
GRANT ALL ON public.crm_admin_settings TO service_role;
ALTER TABLE public.crm_admin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_admin_settings master only"
  ON public.crm_admin_settings FOR ALL
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));
CREATE TRIGGER trg_crm_admin_settings_updated BEFORE UPDATE ON public.crm_admin_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
