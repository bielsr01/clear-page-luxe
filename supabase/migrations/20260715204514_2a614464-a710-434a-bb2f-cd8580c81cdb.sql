
CREATE TABLE public.art_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.art_library TO authenticated;
GRANT ALL ON public.art_library TO service_role;

ALTER TABLE public.art_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view art library"
  ON public.art_library FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert art library"
  ON public.art_library FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can update art library"
  ON public.art_library FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Admins can delete art library"
  ON public.art_library FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER trg_art_library_touch
  BEFORE UPDATE ON public.art_library
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_art_library_created_at ON public.art_library(created_at DESC);
