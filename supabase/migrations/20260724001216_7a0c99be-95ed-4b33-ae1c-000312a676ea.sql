ALTER TABLE public.crm_custom_tasks 
  ADD COLUMN IF NOT EXISTS client_statuses text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS selected_customer_ids uuid[] NOT NULL DEFAULT '{}';