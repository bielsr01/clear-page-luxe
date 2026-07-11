
CREATE TYPE public.lead_status AS ENUM ('em_espera','com_interesse','em_atendimento','desinteressado','contrato_fechado');

CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  city TEXT,
  available_capital NUMERIC(12,2),
  status public.lead_status NOT NULL DEFAULT 'em_espera',
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master admin manages leads"
ON public.leads FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'master_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER trg_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_leads_status ON public.leads(status, position);
