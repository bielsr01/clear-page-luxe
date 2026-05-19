
UPDATE public.expenses
SET expense_date = (created_at AT TIME ZONE 'America/Sao_Paulo')::date
WHERE notes LIKE 'supply_order_item:%'
  AND expense_date <> (created_at AT TIME ZONE 'America/Sao_Paulo')::date;
