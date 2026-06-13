
-- 1. Estender enums (não usar imediatamente no mesmo migration)
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'card_debit';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'card_credit';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'mixed';

-- 2. Colunas em orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES public.cash_register_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS idx_orders_cash_session_id ON public.orders(cash_session_id);

-- 3. Garantir no máximo 1 sessão aberta por restaurante
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_session_per_restaurant
  ON public.cash_register_sessions(restaurant_id)
  WHERE status = 'open';

-- 4. Trigger: anexar cash_session_id automaticamente e bloquear PDV sem caixa
CREATE OR REPLACE FUNCTION public.tg_orders_attach_cash_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sid uuid;
BEGIN
  IF NEW.external_source IS NOT NULL THEN
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
$$;

DROP TRIGGER IF EXISTS trg_orders_attach_cash_session ON public.orders;
CREATE TRIGGER trg_orders_attach_cash_session
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_orders_attach_cash_session();

-- 5. View de resumo
DROP VIEW IF EXISTS public.v_cash_session_summary;
CREATE VIEW public.v_cash_session_summary
WITH (security_invoker = true)
AS
SELECT
  s.id AS session_id,
  s.restaurant_id,
  s.opening_amount,
  s.status,
  s.opened_at,
  s.opened_by,
  COALESCE(sales.cash_sales, 0)::numeric  AS cash_sales,
  COALESCE(sales.pix_sales, 0)::numeric   AS pix_sales,
  COALESCE(sales.card_sales, 0)::numeric  AS card_sales,
  COALESCE(sales.other_sales, 0)::numeric AS other_sales,
  COALESCE(sales.total_sales, 0)::numeric AS total_sales,
  COALESCE(sales.orders_count, 0)::int    AS orders_count,
  COALESCE(mov.manual_in, 0)::numeric     AS manual_in,
  COALESCE(mov.manual_out, 0)::numeric    AS manual_out,
  (s.opening_amount + COALESCE(sales.cash_sales,0) + COALESCE(mov.manual_in,0) - COALESCE(mov.manual_out,0))::numeric AS expected_cash,
  (s.opening_amount + COALESCE(sales.total_sales,0) + COALESCE(mov.manual_in,0) - COALESCE(mov.manual_out,0))::numeric AS total_movement
FROM public.cash_register_sessions s
LEFT JOIN LATERAL (
  SELECT
    SUM(CASE WHEN o.payment_method = 'cash' THEN o.total ELSE 0 END) AS cash_sales,
    SUM(CASE WHEN o.payment_method = 'pix'  THEN o.total ELSE 0 END) AS pix_sales,
    SUM(CASE WHEN o.payment_method::text IN ('card_on_delivery','card_debit','card_credit') THEN o.total ELSE 0 END) AS card_sales,
    SUM(CASE WHEN o.payment_method::text NOT IN ('cash','pix','card_on_delivery','card_debit','card_credit') THEN o.total ELSE 0 END) AS other_sales,
    SUM(o.total) AS total_sales,
    COUNT(*) AS orders_count
  FROM public.orders o
  WHERE o.cash_session_id = s.id AND o.status <> 'cancelled'
) sales ON true
LEFT JOIN LATERAL (
  SELECT
    SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS manual_in,
    SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS manual_out
  FROM public.cash_movements
  WHERE session_id = s.id
) mov ON true;

GRANT SELECT ON public.v_cash_session_summary TO authenticated;
GRANT ALL ON public.v_cash_session_summary TO service_role;

-- 6. Function de fechamento
CREATE OR REPLACE FUNCTION public.close_cash_session(
  _session_id uuid,
  _counted_cash numeric,
  _counted_pix numeric,
  _counted_card numeric,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _s record;
  _sum record;
BEGIN
  SELECT * INTO _s FROM public.cash_register_sessions WHERE id = _session_id FOR UPDATE;
  IF _s IS NULL THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF _s.status <> 'open' THEN RAISE EXCEPTION 'session_already_closed'; END IF;

  IF NOT (public.is_restaurant_manager(auth.uid(), _s.restaurant_id) OR public.has_role(auth.uid(), 'master_admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _sum FROM public.v_cash_session_summary WHERE session_id = _session_id;

  UPDATE public.cash_register_sessions SET
    status = 'closed',
    closed_at = now(),
    closed_by = auth.uid(),
    expected_cash = _sum.expected_cash,
    counted_cash = COALESCE(_counted_cash, 0),
    difference = COALESCE(_counted_cash, 0) - _sum.expected_cash,
    closing_notes = _notes,
    updated_at = now()
  WHERE id = _session_id;

  DELETE FROM public.payment_reconciliation WHERE session_id = _session_id AND platform = 'cash_session';

  INSERT INTO public.payment_reconciliation (session_id, restaurant_id, method, platform, gross, fees, net, orders_count) VALUES
    (_session_id, _s.restaurant_id, 'cash', 'cash_session', COALESCE(_counted_cash,0), 0, COALESCE(_counted_cash,0) - _sum.expected_cash, 0),
    (_session_id, _s.restaurant_id, 'pix',  'cash_session', COALESCE(_counted_pix,0),  0, COALESCE(_counted_pix,0)  - _sum.pix_sales,    0),
    (_session_id, _s.restaurant_id, 'card', 'cash_session', COALESCE(_counted_card,0), 0, COALESCE(_counted_card,0) - _sum.card_sales,   0);

  RETURN jsonb_build_object(
    'session_id', _session_id,
    'expected_cash', _sum.expected_cash,
    'counted_cash', COALESCE(_counted_cash,0),
    'difference_cash', COALESCE(_counted_cash,0) - _sum.expected_cash,
    'difference_pix',  COALESCE(_counted_pix,0)  - _sum.pix_sales,
    'difference_card', COALESCE(_counted_card,0) - _sum.card_sales
  );
END;
$$;

-- 7. Reabertura (apenas master_admin)
CREATE OR REPLACE FUNCTION public.reopen_cash_session(_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _s record;
  _open_exists boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'master_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO _s FROM public.cash_register_sessions WHERE id = _session_id;
  IF _s IS NULL THEN RAISE EXCEPTION 'session_not_found'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.cash_register_sessions
     WHERE restaurant_id = _s.restaurant_id AND status = 'open' AND id <> _session_id
  ) INTO _open_exists;
  IF _open_exists THEN RAISE EXCEPTION 'another_session_open'; END IF;

  UPDATE public.cash_register_sessions
     SET status='open', closed_at=NULL, closed_by=NULL, updated_at=now()
   WHERE id = _session_id;
END;
$$;

-- 8. Realtime
ALTER TABLE public.cash_register_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.cash_movements        REPLICA IDENTITY FULL;
ALTER TABLE public.cash_withdrawals      REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_register_sessions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_movements;        EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_withdrawals;      EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 9. Garantir grants básicos (idempotente)
GRANT SELECT, INSERT, UPDATE ON public.cash_register_sessions TO authenticated;
GRANT SELECT, INSERT          ON public.cash_movements        TO authenticated;
GRANT SELECT, INSERT          ON public.cash_withdrawals      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_reconciliation TO authenticated;
GRANT ALL ON public.cash_register_sessions TO service_role;
GRANT ALL ON public.cash_movements         TO service_role;
GRANT ALL ON public.cash_withdrawals       TO service_role;
GRANT ALL ON public.payment_reconciliation TO service_role;
