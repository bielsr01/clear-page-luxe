
-- 1. Excluir registros 'pending' para avaliação do dia seguinte
DELETE FROM public.crm_task_sends 
WHERE task_key = 'review_next_day' AND status = 'pending';

-- 2. Marcar como 'sent' apenas para clientes que possuem um restaurante válido
INSERT INTO public.crm_task_sends (customer_id, restaurant_id, task_key, reference_date, status, sent_at)
SELECT 
    c.id, 
    c.restaurant_id, 
    'review_next_day', 
    (c.last_order_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date, 
    'sent', 
    now()
FROM public.customers c
JOIN public.restaurants r ON r.id = c.restaurant_id
WHERE 
    c.last_order_at IS NOT NULL
    AND c.last_order_at < (now() AT TIME ZONE 'America/Sao_Paulo')::date
ON CONFLICT (customer_id, restaurant_id, task_key, reference_date) DO NOTHING;
