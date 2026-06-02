CREATE OR REPLACE FUNCTION public.assign_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  candidate integer;
BEGIN
  IF NEW.order_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  LOOP
    candidate := nextval('public.order_number_seq');
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.order_number = candidate
    );
  END LOOP;

  NEW.order_number := candidate;
  RETURN NEW;
END;
$$;

SELECT setval(
  'public.order_number_seq',
  GREATEST(
    COALESCE((SELECT max(order_number) FROM public.orders), 999),
    COALESCE((SELECT last_value FROM public.order_number_seq), 999)
  ),
  true
);