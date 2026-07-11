
CREATE TABLE public.audit_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_groups TO authenticated;
GRANT ALL ON public.audit_groups TO service_role;
ALTER TABLE public.audit_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage audit_groups"
  ON public.audit_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE TABLE public.audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  audit_month text NOT NULL,
  avg_score numeric(5,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audits_restaurant_month_idx ON public.audits(restaurant_id, audit_month);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audits TO authenticated;
GRANT ALL ON public.audits TO service_role;
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage audits"
  ON public.audits FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE TABLE public.audit_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.audits(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.audit_groups(id) ON DELETE SET NULL,
  group_name text NOT NULL,
  score int NOT NULL DEFAULT 0,
  notes text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_scores TO authenticated;
GRANT ALL ON public.audit_scores TO service_role;
ALTER TABLE public.audit_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage audit_scores"
  ON public.audit_scores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));
