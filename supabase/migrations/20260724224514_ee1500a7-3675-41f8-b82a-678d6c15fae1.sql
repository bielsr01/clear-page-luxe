
CREATE TABLE public.art_library_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.art_library_categories TO authenticated;
GRANT ALL ON public.art_library_categories TO service_role;

ALTER TABLE public.art_library_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view art categories"
  ON public.art_library_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admins can insert art categories"
  ON public.art_library_categories FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Only admins can update art categories"
  ON public.art_library_categories FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Only admins can delete art categories"
  ON public.art_library_categories FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER trg_art_library_categories_updated
  BEFORE UPDATE ON public.art_library_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.art_library
  ADD COLUMN category_id uuid REFERENCES public.art_library_categories(id) ON DELETE SET NULL,
  ADD COLUMN format text;
