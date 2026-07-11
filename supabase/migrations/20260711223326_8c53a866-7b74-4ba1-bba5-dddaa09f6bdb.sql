
CREATE TABLE public.expansion_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_name text NOT NULL,
  state_uf text,
  ibge_id text,
  lat double precision,
  lng double precision,
  population integer,
  income_per_capita numeric(14,2),
  gdp numeric(18,2),
  restaurants_count integer DEFAULT 0,
  fastfoods_count integer DEFAULT 0,
  competitors_count integer DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expansion_cities_ibge_id ON public.expansion_cities(ibge_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expansion_cities TO authenticated;
GRANT ALL ON public.expansion_cities TO service_role;

ALTER TABLE public.expansion_cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_admin manage expansion_cities"
  ON public.expansion_cities
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER trg_expansion_cities_updated_at
  BEFORE UPDATE ON public.expansion_cities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
