
CREATE TABLE public.crm_custom_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message_template text NOT NULL DEFAULT '',
  restaurant_ids uuid[] NOT NULL DEFAULT '{}',
  applies_to_all boolean NOT NULL DEFAULT false,
  filter_days integer,
  min_orders integer,
  client_type text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_custom_tasks TO authenticated;
GRANT ALL ON public.crm_custom_tasks TO service_role;

ALTER TABLE public.crm_custom_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage custom tasks"
  ON public.crm_custom_tasks FOR ALL
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Managers view applicable custom tasks"
  ON public.crm_custom_tasks FOR SELECT
  USING (
    active = true AND (
      applies_to_all = true
      OR EXISTS (
        SELECT 1 FROM unnest(restaurant_ids) rid
        WHERE public.is_restaurant_manager(auth.uid(), rid)
      )
    )
  );

CREATE TRIGGER trg_crm_custom_tasks_updated_at
  BEFORE UPDATE ON public.crm_custom_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
