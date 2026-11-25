ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_splits jsonb;

CREATE OR REPLACE VIEW public.v_cash_session_summary WITH (security_invoker = true) AS
SELECT s.id AS session_id, s.restaurant_id, s.opening_amount, s.status, s.opened_at, s.opened_by,
    COALESCE(sales.cash_sales, 0::numeric) AS cash_sales,
    COALESCE(sales.pix_sales, 0::numeric) AS pix_sales,
    COALESCE(sales.card_sales, 0::numeric) AS card_sales,
    COALESCE(sales.other_sales, 0::numeric) AS other_sales,
    COALESCE(sales.total_sales, 0::numeric) AS total_sales,
    COALESCE(sales.orders_count, 0::bigint)::integer AS orders_count,
    COALESCE(mov.manual_in, 0::numeric) AS manual_in,
    COALESCE(mov.manual_out, 0::numeric) AS manual_out,
    COALESCE(mov.manual_in_cash, 0::numeric) AS manual_in_cash,
    COALESCE(mov.manual_out_cash, 0::numeric) AS manual_out_cash,
    COALESCE(mov.manual_in_pix, 0::numeric) AS manual_in_pix,
    COALESCE(mov.manual_out_pix, 0::numeric) AS manual_out_pix,
    s.opening_amount + COALESCE(sales.cash_sales, 0) + COALESCE(mov.manual_in_cash, 0) - COALESCE(mov.manual_out_cash, 0) AS expected_cash,
    COALESCE(sales.pix_sales, 0) + COALESCE(mov.manual_in_pix, 0) - COALESCE(mov.manual_out_pix, 0) AS expected_pix,
    s.opening_amount + COALESCE(sales.total_sales, 0) + COALESCE(mov.manual_in, 0) - COALESCE(mov.manual_out, 0) AS total_movement
FROM cash_register_sessions s
LEFT JOIN LATERAL (
  SELECT
    sum(CASE WHEN p.method = 'cash' THEN p.amount ELSE 0 END) AS cash_sales,
    sum(CASE WHEN p.method = 'pix' THEN p.amount ELSE 0 END) AS pix_sales,
    sum(CASE WHEN p.method IN ('card_on_delivery','card_debit','card_credit') THEN p.amount ELSE 0 END) AS card_sales,
    sum(CASE WHEN p.method NOT IN ('cash','pix','card_on_delivery','card_debit','card_credit') THEN p.amount ELSE 0 END) AS other_sales,
    (SELECT sum(o2.total) FROM orders o2 WHERE o2.cash_session_id = s.id AND o2.status NOT IN ('cancelled','pending')) AS total_sales,
    (SELECT count(*) FROM orders o2 WHERE o2.cash_session_id = s.id AND o2.status NOT IN ('cancelled','pending')) AS orders_count
  FROM orders o
  CROSS JOIN LATERAL (
    SELECT e->>'method' AS method, COALESCE((e->>'amount')::numeric, 0) AS amount
      FROM jsonb_array_elements(o.payment_splits) e
     WHERE jsonb_typeof(o.payment_splits) = 'array' AND jsonb_array_length(o.payment_splits) > 0
    UNION ALL
    SELECT o.payment_method::text, o.total
     WHERE o.payment_splits IS NULL OR jsonb_typeof(o.payment_splits) <> 'array' OR jsonb_array_length(o.payment_splits) = 0
  ) p
  WHERE o.cash_session_id = s.id AND o.status NOT IN ('cancelled','pending')
) sales ON true
LEFT JOIN LATERAL (
  SELECT sum(CASE WHEN cm.amount > 0 THEN cm.amount ELSE 0 END) AS manual_in,
    sum(CASE WHEN cm.amount < 0 THEN -cm.amount ELSE 0 END) AS manual_out,
    sum(CASE WHEN cm.method = 'cash' AND cm.amount > 0 THEN cm.amount ELSE 0 END) AS manual_in_cash,
    sum(CASE WHEN cm.method = 'cash' AND cm.amount < 0 THEN -cm.amount ELSE 0 END) AS manual_out_cash,
    sum(CASE WHEN cm.method = 'pix' AND cm.amount > 0 THEN cm.amount ELSE 0 END) AS manual_in_pix,
    sum(CASE WHEN cm.method = 'pix' AND cm.amount < 0 THEN -cm.amount ELSE 0 END) AS manual_out_pix
  FROM cash_movements cm WHERE cm.session_id = s.id
) mov ON true;

CREATE OR REPLACE FUNCTION public.update_order_payment(_order_id uuid, _splits jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _o public.orders;
  _e jsonb;
  _sum numeric := 0;
  _n int;
  _clean jsonb := '[]'::jsonb;
  _m text;
  _a numeric;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF NOT (public.is_restaurant_manager(auth.uid(), _o.restaurant_id) OR public.has_role(auth.uid(), 'master_admin'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF _o.external_source IS NOT NULL OR _o.order_type NOT IN ('pdv','delivery','pickup') THEN
    RAISE EXCEPTION 'Só pedidos do PDV ou delivery próprio podem ter o pagamento alterado';
  END IF;
  IF jsonb_typeof(_splits) IS DISTINCT FROM 'array' OR jsonb_array_length(_splits) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma forma de pagamento';
  END IF;
  FOR _e IN SELECT * FROM jsonb_array_elements(_splits) LOOP
    _m := _e->>'method';
    _a := round(COALESCE((_e->>'amount')::numeric, 0), 2);
    IF _m NOT IN ('cash','pix','card_debit','card_credit','card_on_delivery') THEN
      RAISE EXCEPTION 'Forma de pagamento inválida';
    END IF;
    IF _a <= 0 THEN RAISE EXCEPTION 'Valores devem ser maiores que zero'; END IF;
    _sum := _sum + _a;
    _clean := _clean || jsonb_build_array(jsonb_build_object('method', _m, 'amount', _a));
  END LOOP;
  IF abs(_sum - round(_o.total, 2)) > 0.009 THEN
    RAISE EXCEPTION 'A soma dos pagamentos (%) precisa ser igual ao total do pedido (%)', _sum, _o.total;
  END IF;
  _n := jsonb_array_length(_clean);
  UPDATE public.orders SET
    payment_method = CASE WHEN _n = 1 THEN (_clean->0->>'method')::payment_method ELSE 'mixed'::payment_method END,
    payment_splits = CASE WHEN _n = 1 THEN NULL ELSE _clean END,
    change_for = CASE WHEN _n = 1 AND _clean->0->>'method' = 'cash' THEN change_for ELSE NULL END,
    updated_at = now()
  WHERE id = _order_id;
  RETURN jsonb_build_object('payment_method', CASE WHEN _n = 1 THEN _clean->0->>'method' ELSE 'mixed' END, 'payment_splits', CASE WHEN _n = 1 THEN NULL ELSE _clean END);
END; $$;

REVOKE ALL ON FUNCTION public.update_order_payment(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_order_payment(uuid, jsonb) TO authenticated;