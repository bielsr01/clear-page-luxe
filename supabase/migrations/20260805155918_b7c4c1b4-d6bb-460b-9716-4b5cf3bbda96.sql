-- Melhora o fluxo de caixa para incluir pedidos em andamento (exceto cancelados/pendentes)
-- e permite que pedidos de delivery iFood/Quero pagos em dinheiro/cartão na entrega entrem no caixa.

-- 1. Atualiza a função de gatilho para permitir pedidos externos NÃO pagos online no caixa
CREATE OR REPLACE FUNCTION public.tg_orders_attach_cash_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _sid uuid;
BEGIN
  -- Pedidos de plataformas externas (iFood, Quero) só entram se NÃO forem pagos online
  -- (ou seja, se o restaurante recebe o dinheiro no ato da entrega)
  IF NEW.external_source IS NOT NULL AND NEW.payment_method = 'online' THEN
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

-- 2. Atualiza a view de resumo para considerar pedidos em andamento
DROP VIEW IF EXISTS public.v_cash_session_summary;

CREATE VIEW public.v_cash_session_summary AS
SELECT s.id AS session_id,
    s.restaurant_id,
    s.opening_amount,
    s.status,
    s.opened_at,
    s.opened_by,
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
    s.opening_amount + COALESCE(sales.cash_sales, 0::numeric) + COALESCE(mov.manual_in_cash, 0::numeric) - COALESCE(mov.manual_out_cash, 0::numeric) AS expected_cash,
    COALESCE(sales.pix_sales, 0::numeric) + COALESCE(mov.manual_in_pix, 0::numeric) - COALESCE(mov.manual_out_pix, 0::numeric) AS expected_pix,
    s.opening_amount + COALESCE(sales.total_sales, 0::numeric) + COALESCE(mov.manual_in, 0::numeric) - COALESCE(mov.manual_out, 0::numeric) AS total_movement
   FROM cash_register_sessions s
     LEFT JOIN LATERAL ( 
        SELECT 
            sum(CASE WHEN o.payment_method = 'cash'::payment_method THEN o.total ELSE 0::numeric END) AS cash_sales,
            sum(CASE WHEN o.payment_method = 'pix'::payment_method THEN o.total ELSE 0::numeric END) AS pix_sales,
            sum(CASE WHEN o.payment_method::text = ANY (ARRAY['card_on_delivery'::text, 'card_debit'::text, 'card_credit'::text]) THEN o.total ELSE 0::numeric END) AS card_sales,
            sum(CASE WHEN o.payment_method::text <> ALL (ARRAY['cash'::text, 'pix'::text, 'card_on_delivery'::text, 'card_debit'::text, 'card_credit'::text]) THEN o.total ELSE 0::numeric END) AS other_sales,
            sum(o.total) AS total_sales,
            count(*) AS orders_count
        FROM orders o
        WHERE o.cash_session_id = s.id 
          AND o.status NOT IN ('cancelled'::order_status, 'pending'::order_status)
     ) sales ON true
     LEFT JOIN LATERAL ( 
        SELECT
            sum(CASE WHEN cm.amount > 0 THEN cm.amount ELSE 0 END) AS manual_in,
            sum(CASE WHEN cm.amount < 0 THEN -cm.amount ELSE 0 END) AS manual_out,
            sum(CASE WHEN cm.method = 'cash' AND cm.amount > 0 THEN cm.amount ELSE 0 END) AS manual_in_cash,
            sum(CASE WHEN cm.method = 'cash' AND cm.amount < 0 THEN -cm.amount ELSE 0 END) AS manual_out_cash,
            sum(CASE WHEN cm.method = 'pix' AND cm.amount > 0 THEN cm.amount ELSE 0 END) AS manual_in_pix,
            sum(CASE WHEN cm.method = 'pix' AND cm.amount < 0 THEN -cm.amount ELSE 0 END) AS manual_out_pix
        FROM cash_movements cm
        WHERE cm.session_id = s.id
     ) mov ON true;

GRANT SELECT ON public.v_cash_session_summary TO authenticated, service_role;
