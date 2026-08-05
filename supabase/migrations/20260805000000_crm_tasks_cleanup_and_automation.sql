-- Adiciona coluna para controle de expiração se não existir (opcional, mas bom para clareza)
-- ALTER TABLE public.crm_task_sends ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Função para limpar tarefas de avaliação pendentes com mais de 5 dias
-- e atualizar as tarefas de avaliação baseadas nos pedidos do dia anterior.
-- Nota: Como o sistema é client-side, esta lógica de "excluir" registros de crm_task_sends 
-- que representam o estado 'pending' (se existirem fisicamente) ou simplesmente 
-- garantir que a query do front-end ignore o que passou de 5 dias.

-- No entanto, o usuário pediu que a regra de 5 dias seja automática às 00:01.
-- Em Supabase/PostgreSQL, podemos usar pg_cron se disponível, ou apenas garantir que 
-- as queries reflitam isso.

-- Vamos criar uma View ou Função que facilite a busca de tarefas pendentes respeitando a regra de 5 dias
-- para a tarefa 'review_next_day'.

CREATE OR REPLACE FUNCTION public.get_crm_tasks_to_process(
    _restaurant_id uuid,
    _task_key text,
    _cutoff_date timestamptz DEFAULT '2026-06-01'::timestamptz
)
RETURNS TABLE (
    customer_id uuid,
    restaurant_id uuid,
    name text,
    phone text,
    orders_count int,
    last_order_at timestamptz,
    reference_date date,
    status text
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH candidate_customers AS (
        -- Clientes que compraram
        SELECT 
            c.id as cust_id,
            c.restaurant_id as rest_id,
            c.name as cust_name,
            c.phone as cust_phone,
            c.orders_count as cust_orders,
            c.last_order_at as cust_last_order,
            (c.last_order_at::date) as ref_date
        FROM public.customers c
        WHERE (_restaurant_id IS NULL OR c.restaurant_id = _restaurant_id)
          AND c.last_order_at >= _cutoff_date
    ),
    sends AS (
        SELECT s.customer_id, s.reference_date, s.status, s.task_key
        FROM public.crm_task_sends s
        WHERE s.task_key = _task_key
          AND (_restaurant_id IS NULL OR s.restaurant_id = _restaurant_id)
    )
    SELECT 
        cc.cust_id,
        cc.rest_id,
        cc.cust_name,
        cc.cust_phone,
        cc.cust_orders,
        cc.cust_last_order,
        cc.ref_date,
        COALESCE(s.status, 'pending') as current_status
    FROM candidate_customers cc
    LEFT JOIN sends s ON s.customer_id = cc.cust_id AND s.reference_date = cc.ref_date
    WHERE 
        CASE 
            WHEN _task_key = 'review_next_day' THEN
                -- Regra Avaliação: Pedidos de ontem (já filtrado pelo component, aqui reforçamos)
                -- E se pendente, não pode ter mais de 5 dias de atraso desde o pedido
                (cc.ref_date = (CURRENT_DATE - INTERVAL '1 day')::date OR (COALESCE(s.status, 'pending') = 'sent'))
                AND (COALESCE(s.status, 'pending') = 'sent' OR cc.ref_date >= (CURRENT_DATE - INTERVAL '5 days')::date)
            ELSE
                -- Outras tarefas: Seguem o range de dias definido no componente (lógica mantida no front por enquanto)
                TRUE
        END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_tasks_to_process TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_crm_tasks_to_process TO service_role;

-- Comentário: A limpeza física de registros 'pending' antigos de crm_task_sends (se houver) 
-- pode ser feita periodicamente. Registros 'sent' NUNCA são excluídos.
DELETE FROM public.crm_task_sends 
WHERE task_key = 'review_next_day' 
  AND status = 'pending' 
  AND reference_date < (CURRENT_DATE - INTERVAL '5 days')::date;

