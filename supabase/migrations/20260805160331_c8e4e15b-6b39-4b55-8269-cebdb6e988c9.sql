-- Fluxo de caixa: incluir também pedidos de RETIRADA (pickup) pagos presencialmente
CREATE OR REPLACE FUNCTION public.tg_orders_attach_cash_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _sid uuid;
BEGIN
  -- Pagamentos ONLINE (pré-pagos nas plataformas) nunca entram no caixa físico
  IF NEW.payment_method = 'online' THEN
    NEW.cash_session_id := NULL;
    RETURN NEW;
  END IF;

  -- PDV, delivery e retirada pagos presencialmente entram no caixa
  IF NEW.order_type NOT IN ('pdv', 'delivery', 'pickup') THEN
    NEW.cash_session_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.cash_session_id IS NULL THEN
    SELECT id INTO _sid
      FROM public.cash_register_sessions
     WHERE restaurant_id = NEW.restaurant_id AND status = 'open'
     ORDER BY opened_at DESC
     LIMIT 1;
    NEW.cash_session_id := _sid;
  END IF;

  IF NEW.order_type = 'pdv' AND NEW.cash_session_id IS NULL THEN
    RAISE EXCEPTION 'NO_OPEN_CASH_SESSION' USING HINT = 'Abra um caixa antes de registrar uma venda PDV.';
  END IF;

  RETURN NEW;
END;
$function$;

-- Garante que o gatilho roda também em UPDATE (pedido criado com caixa fechado e concluído depois)
DROP TRIGGER IF EXISTS trg_orders_attach_cash_session_upd ON public.orders;
CREATE TRIGGER trg_orders_attach_cash_session_upd
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (NEW.cash_session_id IS NULL AND NEW.status <> 'cancelled')
EXECUTE FUNCTION public.tg_orders_attach_cash_session();
