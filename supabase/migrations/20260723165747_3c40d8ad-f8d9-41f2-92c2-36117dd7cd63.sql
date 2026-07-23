
ALTER TABLE public.audits
  ADD COLUMN IF NOT EXISTS auditor_name text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'system';

CREATE TABLE IF NOT EXISTS public.audit_external_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  audit_month text NOT NULL,
  token text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, audit_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_external_links TO authenticated;
GRANT ALL ON public.audit_external_links TO service_role;

ALTER TABLE public.audit_external_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage audit_external_links"
  ON public.audit_external_links
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));
