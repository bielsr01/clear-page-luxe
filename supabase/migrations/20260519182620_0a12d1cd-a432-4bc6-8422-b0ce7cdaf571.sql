ALTER TABLE public.product_option_groups
  ADD COLUMN IF NOT EXISTS min_select_override integer,
  ADD COLUMN IF NOT EXISTS max_select_override integer;