CREATE OR REPLACE FUNCTION public.tg_orders_attach_cash_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _sid uuid;
BEGIN
  -- Pedidos de plataformas externas (iFood, Quero) NUNCA entram no fluxo de caixa
  IF NEW.external_source IS NOT NULL THEN
    NEW.cash_session_id := NULL;
    RETURN NEW;
  END IF;

  -- Só PDV e delivery contam para o caixa (pagamento na entrega / presencial)
  IF NEW.order_type NOT IN ('pdv', 'delivery') THEN
    NEW.cash_session_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.cash_session_id IS NULL THEN
    SELECT id INTO _sid
      FROM public.cash_register_sessions
     WHERE restaurant_id = NEW.restaurant_id AND status = 'open'
     LIMIT 1;
    NEW.cash_session_id := _sid;
  END IF;

  IF NEW.order_type = 'pdv' AND NEW.cash_session_id IS NULL THEN
    RAISE EXCEPTION 'NO_OPEN_CASH_SESSION' USING HINT = 'Abra um caixa antes de registrar uma venda PDV.';
  END IF;

  RETURN NEW;
END;
$function$;