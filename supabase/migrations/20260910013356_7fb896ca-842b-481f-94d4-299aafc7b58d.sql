DROP POLICY IF EXISTS "Anyone authenticated can read access groups" ON public.access_groups;
CREATE POLICY "Access groups readable by restaurant team"
  ON public.access_groups FOR SELECT TO authenticated
  USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'::app_role));

DROP POLICY IF EXISTS "PSC public read" ON public.product_stock_consumption;
CREATE POLICY "PSC readable by restaurant team"
  ON public.product_stock_consumption FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'master_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_stock_consumption.product_id
        AND public.is_restaurant_manager(auth.uid(), p.restaurant_id)
    )
  );
REVOKE SELECT ON public.product_stock_consumption FROM anon;
REVOKE SELECT ON public.access_groups FROM anon;