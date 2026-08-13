UPDATE public.orders o
SET status = 'delivered'::order_status, updated_at = now()
WHERE o.external_source = 'ifood'
  AND o.status NOT IN ('delivered'::order_status, 'cancelled'::order_status)
  AND EXISTS (
    SELECT 1 FROM public.ihub_events e
    WHERE e.order_id = o.external_order_id
      AND e.full_code = 'CONCLUDED'
  );