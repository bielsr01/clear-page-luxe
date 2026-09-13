CREATE TABLE public.bio_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  order_enabled boolean NOT NULL DEFAULT true,
  franchise_enabled boolean NOT NULL DEFAULT true,
  franchise_url text,
  careers_enabled boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bio_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bio_settings TO authenticated;
GRANT ALL ON public.bio_settings TO service_role;
ALTER TABLE public.bio_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads bio settings" ON public.bio_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Master admins manage bio settings" ON public.bio_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master_admin')) WITH CHECK (public.has_role(auth.uid(), 'master_admin'));

CREATE TABLE public.bio_restaurant_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  custom_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id)
);
GRANT SELECT ON public.bio_restaurant_links TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bio_restaurant_links TO authenticated;
GRANT ALL ON public.bio_restaurant_links TO service_role;
ALTER TABLE public.bio_restaurant_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads enabled bio restaurant links" ON public.bio_restaurant_links FOR SELECT TO anon, authenticated USING (enabled OR public.has_role(auth.uid(), 'master_admin'));
CREATE POLICY "Master admins manage bio restaurant links" ON public.bio_restaurant_links FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master_admin')) WITH CHECK (public.has_role(auth.uid(), 'master_admin'));
CREATE INDEX bio_restaurant_links_enabled_idx ON public.bio_restaurant_links(enabled);
CREATE TRIGGER bio_restaurant_links_touch_updated_at BEFORE UPDATE ON public.bio_restaurant_links FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  birth_date date NOT NULL,
  sex text NOT NULL,
  phone text NOT NULL,
  city text NOT NULL,
  resume_key text NOT NULL UNIQUE,
  resume_filename text NOT NULL,
  resume_mime_type text NOT NULL,
  resume_size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.job_applications TO authenticated;
GRANT ALL ON public.job_applications TO service_role;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Master admins manage job applications" ON public.job_applications FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'master_admin')) WITH CHECK (public.has_role(auth.uid(), 'master_admin'));
CREATE INDEX job_applications_created_at_idx ON public.job_applications(created_at DESC);

CREATE TABLE public.job_application_rate_limits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.job_application_rate_limits TO service_role;
ALTER TABLE public.job_application_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE INDEX job_application_rate_limits_lookup_idx ON public.job_application_rate_limits(ip_hash, created_at DESC);