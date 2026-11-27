CREATE OR REPLACE FUNCTION public.update_order_payment(_order_id uuid, _splits jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
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
  IF _o.status NOT IN ('pending','accepted','preparing','out_for_delivery','awaiting_pickup') THEN
    RAISE EXCEPTION 'O pagamento só pode ser alterado enquanto o pedido estiver aberto';
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