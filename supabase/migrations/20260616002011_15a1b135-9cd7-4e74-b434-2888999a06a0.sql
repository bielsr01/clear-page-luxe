
-- 1) Toggles per integration
ALTER TABLE public.ihub_integrations
  ADD COLUMN IF NOT EXISTS auto_stock_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.quero_integrations
  ADD COLUMN IF NOT EXISTS auto_stock_enabled boolean NOT NULL DEFAULT false;

-- 2) Logs table
CREATE TABLE IF NOT EXISTS public.external_stock_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('ifood','quero')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  external_order_number text,
  order_item_name text NOT NULL,
  order_item_quantity integer NOT NULL DEFAULT 1,
  matched_product_id uuid,
  matched_product_name text,
  stock_group_id uuid,
  stock_group_name text,
  quantity_debited integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('debited','no_product_match','no_stock_link','skipped','error')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_stock_logs_restaurant_created
  ON public.external_stock_logs(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_stock_logs_order
  ON public.external_stock_logs(order_id);

GRANT SELECT ON public.external_stock_logs TO authenticated;
GRANT ALL ON public.external_stock_logs TO service_role;

ALTER TABLE public.external_stock_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant managers can view their stock logs"
ON public.external_stock_logs FOR SELECT TO authenticated
USING (
  public.is_restaurant_manager(auth.uid(), restaurant_id)
  OR public.has_role(auth.uid(), 'master_admin'::app_role)
);

-- 3) Normalize a product name for fuzzy comparison
CREATE OR REPLACE FUNCTION public.normalize_product_name(_n text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(regexp_replace(
    translate(coalesce(_n,''),
      'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'),
    '[^a-zA-Z0-9]+', '', 'g'))
$$;

-- 4) Match a product within a restaurant by normalized name (exact, then substring fallback)
CREATE OR REPLACE FUNCTION public.match_product_by_name(_restaurant_id uuid, _name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm text := public.normalize_product_name(_name);
  _pid uuid;
BEGIN
  IF _norm = '' THEN RETURN NULL; END IF;

  -- Exact normalized match
  SELECT id INTO _pid FROM public.products
   WHERE restaurant_id = _restaurant_id
     AND is_active = true
     AND public.normalize_product_name(name) = _norm
   LIMIT 1;
  IF _pid IS NOT NULL THEN RETURN _pid; END IF;

  -- Fallback: longest product name contained in / containing the order item
  SELECT id INTO _pid FROM public.products
   WHERE restaurant_id = _restaurant_id
     AND is_active = true
     AND (
       public.normalize_product_name(name) LIKE '%' || _norm || '%'
       OR _norm LIKE '%' || public.normalize_product_name(name) || '%'
     )
   ORDER BY length(public.normalize_product_name(name)) DESC
   LIMIT 1;
  RETURN _pid;
END;
$$;

-- 5) Debit stock for an external order (iFood / Quero). Idempotent per order.
CREATE OR REPLACE FUNCTION public.debit_external_order_stock(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ord record;
  _enabled boolean;
  _it record;
  _matched_id uuid;
  _matched_name text;
  _consumption record;
  _qty int;
  _has_consumption boolean;
  _already int;
BEGIN
  SELECT id, restaurant_id, status, external_source, external_display_id, order_number
    INTO _ord FROM public.orders WHERE id = _order_id;
  IF _ord.id IS NULL THEN RETURN; END IF;
  IF _ord.external_source NOT IN ('ifood','quero') THEN RETURN; END IF;
  IF _ord.status <> 'delivered' THEN RETURN; END IF;

  -- Idempotency: skip if we already processed this order
  SELECT COUNT(*) INTO _already
    FROM public.external_stock_logs
   WHERE order_id = _order_id;
  IF _already > 0 THEN RETURN; END IF;

  IF _ord.external_source = 'ifood' THEN
    SELECT auto_stock_enabled INTO _enabled
      FROM public.ihub_integrations WHERE restaurant_id = _ord.restaurant_id LIMIT 1;
  ELSE
    SELECT auto_stock_enabled INTO _enabled
      FROM public.quero_integrations WHERE restaurant_id = _ord.restaurant_id LIMIT 1;
  END IF;

  IF NOT COALESCE(_enabled, false) THEN
    INSERT INTO public.external_stock_logs(
      restaurant_id, source, order_id, external_order_number,
      order_item_name, order_item_quantity, status, notes
    )
    SELECT _ord.restaurant_id, _ord.external_source, _ord.id,
           COALESCE(_ord.external_display_id, _ord.order_number::text),
           oi.product_name, oi.quantity, 'skipped',
           'Estoque automático desativado para ' || _ord.external_source
      FROM public.order_items oi WHERE oi.order_id = _order_id;
    RETURN;
  END IF;

  FOR _it IN
    SELECT id, product_name, quantity FROM public.order_items WHERE order_id = _order_id
  LOOP
    _matched_id := public.match_product_by_name(_ord.restaurant_id, _it.product_name);

    IF _matched_id IS NULL THEN
      INSERT INTO public.external_stock_logs(
        restaurant_id, source, order_id, external_order_number,
        order_item_name, order_item_quantity, status, notes
      ) VALUES (
        _ord.restaurant_id, _ord.external_source, _ord.id,
        COALESCE(_ord.external_display_id, _ord.order_number::text),
        _it.product_name, _it.quantity, 'no_product_match',
        'Nenhum produto do cardápio corresponde ao item'
      );
      CONTINUE;
    END IF;

    SELECT name INTO _matched_name FROM public.products WHERE id = _matched_id;

    _has_consumption := false;
    FOR _consumption IN
      SELECT psc.group_id, psc.quantity_per_unit, sg.name AS group_name
        FROM public.product_stock_consumption psc
        JOIN public.stock_groups sg ON sg.id = psc.group_id
       WHERE psc.product_id = _matched_id
    LOOP
      _has_consumption := true;
      _qty := (_it.quantity * _consumption.quantity_per_unit)::int;
      IF _qty <= 0 THEN CONTINUE; END IF;

      PERFORM public.apply_stock_delta(
        _ord.restaurant_id, _consumption.group_id, -_qty,
        'order_consumption'::stock_movement_type, _order_id,
        _ord.external_source || ' entregue - débito automático'
      );

      INSERT INTO public.external_stock_logs(
        restaurant_id, source, order_id, external_order_number,
        order_item_name, order_item_quantity,
        matched_product_id, matched_product_name,
        stock_group_id, stock_group_name,
        quantity_debited, status
      ) VALUES (
        _ord.restaurant_id, _ord.external_source, _ord.id,
        COALESCE(_ord.external_display_id, _ord.order_number::text),
        _it.product_name, _it.quantity,
        _matched_id, _matched_name,
        _consumption.group_id, _consumption.group_name,
        _qty, 'debited'
      );
    END LOOP;

    IF NOT _has_consumption THEN
      INSERT INTO public.external_stock_logs(
        restaurant_id, source, order_id, external_order_number,
        order_item_name, order_item_quantity,
        matched_product_id, matched_product_name,
        status, notes
      ) VALUES (
        _ord.restaurant_id, _ord.external_source, _ord.id,
        COALESCE(_ord.external_display_id, _ord.order_number::text),
        _it.product_name, _it.quantity,
        _matched_id, _matched_name,
        'no_stock_link',
        'Produto encontrado mas sem grupo de estoque vinculado'
      );
    END IF;
  END LOOP;
END;
$$;

-- 6) Trigger: when an iFood/Quero order becomes 'delivered', debit stock.
CREATE OR REPLACE FUNCTION public.tg_external_order_delivered_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.external_source IN ('ifood','quero')
     AND NEW.status = 'delivered'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    BEGIN
      PERFORM public.debit_external_order_stock(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.external_stock_logs(
        restaurant_id, source, order_id, external_order_number,
        order_item_name, order_item_quantity, status, notes
      ) VALUES (
        NEW.restaurant_id, NEW.external_source, NEW.id,
        COALESCE(NEW.external_display_id, NEW.order_number::text),
        '(erro de processamento)', 0, 'error', SQLERRM
      );
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_external_order_delivered_stock ON public.orders;
CREATE TRIGGER trg_external_order_delivered_stock
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_external_order_delivered_stock();
