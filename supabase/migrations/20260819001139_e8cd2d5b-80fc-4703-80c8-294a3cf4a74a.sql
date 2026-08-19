ALTER TABLE public.supply_products
  ADD COLUMN IF NOT EXISTS admin_stock_group_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

UPDATE public.supply_products
SET admin_stock_group_ids = ARRAY[admin_stock_group_id]
WHERE admin_stock_group_id IS NOT NULL
  AND (admin_stock_group_ids IS NULL OR cardinality(admin_stock_group_ids) = 0);