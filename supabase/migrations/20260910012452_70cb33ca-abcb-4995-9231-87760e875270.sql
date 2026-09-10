-- 1) Remove leitura pública de pedidos e itens
DROP POLICY IF EXISTS "Public can view orders" ON public.orders;
DROP POLICY IF EXISTS "Public can view order items" ON public.order_items;
DROP POLICY IF EXISTS "Order item options are viewable with order items" ON public.order_item_options;

CREATE POLICY "Manager views order item options"
ON public.order_item_options FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = order_item_options.order_item_id
    AND (public.is_restaurant_manager(auth.uid(), o.restaurant_id)
         OR public.has_role(auth.uid(), 'master_admin'::app_role))
));

-- 2) Funções seguras para as páginas públicas
CREATE OR REPLACE FUNCTION public.get_public_order(_order_id uuid DEFAULT NULL, _token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _o public.orders;
  _items jsonb;
  _opts jsonb;
BEGIN
  IF _token IS NOT NULL AND _token <> '' THEN
    SELECT * INTO _o FROM public.orders WHERE public_token = _token LIMIT 1;
  ELSIF _order_id IS NOT NULL THEN
    SELECT * INTO _o FROM public.orders WHERE id = _order_id LIMIT 1;
  ELSE
    RETURN NULL;
  END IF;
  IF _o.id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.created_at), '[]'::jsonb) INTO _items
    FROM public.order_items i WHERE i.order_id = _o.id;

  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO _opts
    FROM public.order_item_options x
    JOIN public.order_items i ON i.id = x.order_item_id
   WHERE i.order_id = _o.id;

  RETURN jsonb_build_object('order', to_jsonb(_o), 'items', _items, 'options', _opts);
END; $$;

GRANT EXECUTE ON FUNCTION public.get_public_order(uuid, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_orders_by_tokens(_tokens text[])
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id, 'status', o.status, 'total', o.total,
    'public_token', o.public_token, 'created_at', o.created_at,
    'order_number', o.order_number, 'order_type', o.order_type,
    'restaurant_id', o.restaurant_id
  ) ORDER BY o.created_at DESC), '[]'::jsonb)
  FROM public.orders o
  WHERE o.public_token = ANY(COALESCE(_tokens, ARRAY[]::text[]));
$$;

GRANT EXECUTE ON FUNCTION public.get_orders_by_tokens(text[]) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_prev_delivery_addresses(_restaurant_id uuid, _phones text[])
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
    SELECT o.address_cep, o.address_street, o.address_number, o.address_complement,
           o.address_neighborhood, o.address_city, o.address_state, o.address_notes,
           o.delivery_latitude, o.delivery_longitude, o.created_at
      FROM public.orders o
     WHERE o.restaurant_id = _restaurant_id
       AND o.customer_phone = ANY(COALESCE(_phones, ARRAY[]::text[]))
       AND o.order_type = 'delivery'
       AND o.address_street IS NOT NULL
     ORDER BY o.created_at DESC
     LIMIT 15
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.get_prev_delivery_addresses(uuid, text[]) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.count_orders_by_phone(_restaurant_id uuid, _phones text[], _coupon_code text DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::int FROM public.orders o
   WHERE o.restaurant_id = _restaurant_id
     AND o.customer_phone = ANY(COALESCE(_phones, ARRAY[]::text[]))
     AND (_coupon_code IS NULL OR upper(o.coupon_code) = upper(_coupon_code));
$$;

GRANT EXECUTE ON FUNCTION public.count_orders_by_phone(uuid, text[], text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.customer_exists_by_phone(_restaurant_id uuid, _phones text[])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.restaurant_id = _restaurant_id
       AND c.phone = ANY(COALESCE(_phones, ARRAY[]::text[]))
  );
$$;

GRANT EXECUTE ON FUNCTION public.customer_exists_by_phone(uuid, text[]) TO anon, authenticated, service_role;

-- 3) Storage: buckets legados (vazios) restritos ao admin
DROP POLICY IF EXISTS "Expense receipts manager read" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload menu images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update own menu images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete own menu images" ON storage.objects;

CREATE POLICY "Expense receipts admin only"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'expense-receipts' AND public.has_role(auth.uid(), 'master_admin'::app_role))
WITH CHECK (bucket_id = 'expense-receipts' AND public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "Menu images write by owner restaurant"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'menu-images' AND (
    public.has_role(auth.uid(), 'master_admin'::app_role)
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.is_restaurant_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  )
)
WITH CHECK (
  bucket_id = 'menu-images' AND (
    public.has_role(auth.uid(), 'master_admin'::app_role)
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.is_restaurant_manager(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  )
);

-- 4) View com security_invoker
ALTER VIEW public.v_cash_session_summary SET (security_invoker = on);

-- 5) search_path fixo nas funções que faltavam
ALTER FUNCTION public.create_loyalty_consultation_code(uuid, text) SET search_path TO 'public';
ALTER FUNCTION public.verify_loyalty_consultation_code(uuid, text) SET search_path TO 'public';
ALTER FUNCTION public.on_restaurant_created_loyalty() SET search_path TO 'public';