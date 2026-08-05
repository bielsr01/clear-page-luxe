
-- 1) Zerar pendentes antigos de 'review_next_day'
DELETE FROM public.crm_task_sends 
WHERE task_key = 'review_next_day' AND status = 'pending';

-- 2) Marcar pedidos antigos como "enviados" para que não apareçam no CRM como pendentes
-- Filtrando apenas clientes cujos restaurantes ainda existem
INSERT INTO public.crm_task_sends (restaurant_id, customer_id, task_key, reference_date, status, sent_at)
SELECT 
    c.restaurant_id, 
    c.id as customer_id, 
    'review_next_day', 
    (c.last_order_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date as reference_date,
    'sent',
    now()
FROM public.customers c
INNER JOIN public.restaurants r ON r.id = c.restaurant_id
WHERE c.last_order_at < (now() AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date
ON CONFLICT (restaurant_id, customer_id, task_key, reference_date) DO UPDATE SET status = 'sent';
