-- Step 1: Force cleanup of all pending records for review_next_day
DELETE FROM public.crm_task_sends 
WHERE task_key = 'review_next_day' 
  AND status = 'pending';

-- Step 2: Mark past orders as 'sent' ONLY for customers that belong to valid restaurants
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
WHERE c.last_order_at IS NOT NULL
  AND (c.last_order_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date < '2026-08-05'::date
ON CONFLICT (restaurant_id, task_key, customer_id, reference_date) DO UPDATE 
SET status = 'sent';