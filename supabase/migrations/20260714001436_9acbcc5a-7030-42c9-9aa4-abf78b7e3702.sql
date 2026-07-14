
-- Stores
CREATE TABLE public.implantacao_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  franchisee_name text,
  city text,
  consultant text,
  contract_signed_at date,
  expected_opening_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.implantacao_stores TO authenticated;
GRANT ALL ON public.implantacao_stores TO service_role;
ALTER TABLE public.implantacao_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master admin manage implantacao_stores"
  ON public.implantacao_stores FOR ALL
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));
CREATE TRIGGER trg_implantacao_stores_updated BEFORE UPDATE ON public.implantacao_stores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Checklist item catalog
CREATE TABLE public.implantacao_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.implantacao_checklist_items TO authenticated;
GRANT ALL ON public.implantacao_checklist_items TO service_role;
ALTER TABLE public.implantacao_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master admin manage implantacao_checklist_items"
  ON public.implantacao_checklist_items FOR ALL
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));
CREATE TRIGGER trg_implantacao_checklist_items_updated BEFORE UPDATE ON public.implantacao_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Per-store checklist status
CREATE TABLE public.implantacao_checklist_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.implantacao_stores(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.implantacao_checklist_items(id) ON DELETE CASCADE,
  checked boolean NOT NULL DEFAULT false,
  checked_at timestamptz,
  checked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.implantacao_checklist_status TO authenticated;
GRANT ALL ON public.implantacao_checklist_status TO service_role;
ALTER TABLE public.implantacao_checklist_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master admin manage implantacao_checklist_status"
  ON public.implantacao_checklist_status FOR ALL
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));
CREATE TRIGGER trg_implantacao_checklist_status_updated BEFORE UPDATE ON public.implantacao_checklist_status
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_implantacao_status_store ON public.implantacao_checklist_status(store_id);

-- Seed default checklist items
INSERT INTO public.implantacao_checklist_items (name, sort_order) VALUES
  ('COF assinada', 1),
  ('Contrato assinado', 2),
  ('CNPJ aberto', 3),
  ('Conta jurídica', 4),
  ('Instalações Elétricas', 5),
  ('Caixa de gordura', 6),
  ('Balcão de fritadeira', 7),
  ('Pintura', 8),
  ('Fachada', 9),
  ('Freezer', 10),
  ('Geladeira', 11),
  ('Fritadeira', 12),
  ('Celular', 13),
  ('Conta de WhatsApp', 14),
  ('Cardápio dentro do WhatsApp', 15),
  ('Google Meu Negócio', 16),
  ('Computador', 17),
  ('Impressora térmica', 18),
  ('Internet', 19),
  ('Sistema instalado', 20),
  ('Balcão', 21),
  ('Coifa', 22),
  ('Mesas e cadeiras', 23),
  ('Quadros', 24),
  ('Cardápio físico', 25),
  ('Cardápio on-line', 26),
  ('Alvará de funcionamento', 27),
  ('Embalagens', 28),
  ('Wind banner', 29),
  ('Treinamentos iniciais', 30);
