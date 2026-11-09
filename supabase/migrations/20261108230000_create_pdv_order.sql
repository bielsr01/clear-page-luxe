-- Venda de PDV atômica: pedido, itens e opções na mesma transação, para nunca existir
-- pedido sem itens. `client_request_id` torna a chamada idempotente: repetir a mesma venda
-- (queda de internet, clique duplo) devolve o pedido já criado em vez de duplicar.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS orders_client_request_id_key
  ON public.orders (client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_pdv_order(
  _request_id uuid,
  _restaurant_id uuid,
  _order jsonb,
  _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _o public.orders;
  _row public.orders;
  _item jsonb;
  _item_id uuid;
  _constraint text;
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.is_restaurant_manager(auth.uid(), _restaurant_id)
             OR public.has_role(auth.uid(), 'master_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _request_id IS NULL THEN
    RAISE EXCEPTION 'PDV_ORDER_WITHOUT_REQUEST_ID' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'PDV_ORDER_WITHOUT_ITEMS' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM public.orders WHERE client_request_id = _request_id;

  IF NOT FOUND THEN
    _o := jsonb_populate_record(NULL::public.orders, _order);
    BEGIN
      INSERT INTO public.orders (
        restaurant_id, order_type, status, customer_name, customer_phone, payment_method,
        change_for, subtotal, discount, service_fee, delivery_fee, total, loyalty_opt_in,
        cash_session_id, created_by, client_request_id
      ) VALUES (
        _restaurant_id, 'pdv', 'preparing', _o.customer_name, _o.customer_phone, _o.payment_method,
        _o.change_for, _o.subtotal, COALESCE(_o.discount, 0), COALESCE(_o.service_fee, 0),
        COALESCE(_o.delivery_fee, 0), _o.total, COALESCE(_o.loyalty_opt_in, false),
        _o.cash_session_id, auth.uid(), _request_id
      )
      RETURNING * INTO _row;

      FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
        INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, quantity, notes)
        VALUES (
          _row.id,
          NULLIF(_item->>'product_id', '')::uuid,
          _item->>'product_name',
          (_item->>'unit_price')::numeric,
          (_item->>'quantity')::integer,
          _item->>'notes'
        )
        RETURNING id INTO _item_id;

        INSERT INTO public.order_item_options (order_item_id, option_item_id, group_name, item_name, extra_price)
        SELECT _item_id,
               NULLIF(opt->>'option_item_id', '')::uuid,
               opt->>'group_name',
               opt->>'item_name',
               COALESCE((opt->>'extra_price')::numeric, 0)
          FROM jsonb_array_elements(COALESCE(_item->'options', '[]'::jsonb)) AS opt;
      END LOOP;
    EXCEPTION WHEN unique_violation THEN
      -- Duas chamadas simultâneas da mesma venda: fica valendo a que gravou primeiro.
      GET STACKED DIAGNOSTICS _constraint = CONSTRAINT_NAME;
      IF _constraint IS DISTINCT FROM 'orders_client_request_id_key' THEN
        RAISE;
      END IF;
      SELECT * INTO STRICT _row FROM public.orders WHERE client_request_id = _request_id;
    END;
  END IF;

  RETURN jsonb_build_object(
    'id', _row.id,
    'order_number', _row.order_number,
    'customer_name', _row.customer_name,
    'customer_phone', _row.customer_phone,
    'payment_method', _row.payment_method,
    'change_for', _row.change_for,
    'subtotal', _row.subtotal,
    'total', _row.total,
    'created_at', _row.created_at,
    'status', _row.status,
    'order_type', _row.order_type
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_pdv_order(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pdv_order(uuid, uuid, jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
