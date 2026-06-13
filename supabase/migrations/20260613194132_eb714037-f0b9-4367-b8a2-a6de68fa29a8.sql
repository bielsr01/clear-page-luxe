
ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'cash'
  CHECK (method IN ('cash','pix'));

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
     LEFT JOIN LATERAL ( SELECT sum(CASE WHEN o.payment_method = 'cash'::payment_method THEN o.total ELSE 0::numeric END) AS cash_sales,
            sum(CASE WHEN o.payment_method = 'pix'::payment_method THEN o.total ELSE 0::numeric END) AS pix_sales,
            sum(CASE WHEN o.payment_method::text = ANY (ARRAY['card_on_delivery'::text, 'card_debit'::text, 'card_credit'::text]) THEN o.total ELSE 0::numeric END) AS card_sales,
            sum(CASE WHEN o.payment_method::text <> ALL (ARRAY['cash'::text, 'pix'::text, 'card_on_delivery'::text, 'card_debit'::text, 'card_credit'::text]) THEN o.total ELSE 0::numeric END) AS other_sales,
            sum(o.total) AS total_sales,
            count(*) AS orders_count
           FROM orders o
          WHERE o.cash_session_id = s.id AND o.status <> 'cancelled'::order_status) sales ON true
     LEFT JOIN LATERAL ( SELECT
            sum(CASE WHEN cm.amount > 0 THEN cm.amount ELSE 0 END) AS manual_in,
            sum(CASE WHEN cm.amount < 0 THEN -cm.amount ELSE 0 END) AS manual_out,
            sum(CASE WHEN cm.method = 'cash' AND cm.amount > 0 THEN cm.amount ELSE 0 END) AS manual_in_cash,
            sum(CASE WHEN cm.method = 'cash' AND cm.amount < 0 THEN -cm.amount ELSE 0 END) AS manual_out_cash,
            sum(CASE WHEN cm.method = 'pix' AND cm.amount > 0 THEN cm.amount ELSE 0 END) AS manual_in_pix,
            sum(CASE WHEN cm.method = 'pix' AND cm.amount < 0 THEN -cm.amount ELSE 0 END) AS manual_out_pix
           FROM cash_movements cm
          WHERE cm.session_id = s.id) mov ON true;

GRANT SELECT ON public.v_cash_session_summary TO anon, authenticated, service_role;
