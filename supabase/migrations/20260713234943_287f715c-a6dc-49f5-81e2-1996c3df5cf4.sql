
-- Categorias
CREATE TABLE public.document_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_categories TO authenticated;
GRANT ALL ON public.document_categories TO service_role;
ALTER TABLE public.document_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage document_categories" ON public.document_categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));
CREATE TRIGGER trg_document_categories_updated BEFORE UPDATE ON public.document_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Documentos
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL CHECK (doc_type IN ('commercial','investor','franchisee')),
  category_id uuid REFERENCES public.document_categories(id) ON DELETE SET NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage documents" ON public.documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));
CREATE INDEX idx_documents_type ON public.documents(doc_type);
CREATE INDEX idx_documents_restaurant ON public.documents(restaurant_id);
CREATE INDEX idx_documents_category ON public.documents(category_id);
CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage policies (bucket 'documents' já criado como privado)
CREATE POLICY "admin read documents bucket" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'master_admin'::app_role));
CREATE POLICY "admin insert documents bucket" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND public.has_role(auth.uid(), 'master_admin'::app_role));
CREATE POLICY "admin update documents bucket" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'master_admin'::app_role));
CREATE POLICY "admin delete documents bucket" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND public.has_role(auth.uid(), 'master_admin'::app_role));
