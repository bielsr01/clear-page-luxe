ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_doc_type_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_doc_type_check CHECK (doc_type = ANY (ARRAY['commercial'::text,'investor'::text,'franchisee'::text,'franchisor'::text]));
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS description text;