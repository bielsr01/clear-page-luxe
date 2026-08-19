ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_counted boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.tg_orders_coupon_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _should boolean;
  _cid uuid;
BEGIN
  IF NEW.coupon_code IS NULL OR NEW.external_source IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _cid
  FROM public.coupons
  WHERE restaurant_id = NEW.restaurant_id
    AND upper(code) = upper(NEW.coupon_code)
  LIMIT 1;

  IF _cid IS NULL THEN
    RETURN NEW;
  END IF;

  _should := NEW.status NOT IN ('pending'::order_status, 'cancelled'::order_status);

  IF _should AND NOT COALESCE(NEW.coupon_counted, false) THEN
    UPDATE public.coupons SET uses_count = COALESCE(uses_count, 0) + 1 WHERE id = _cid;
    NEW.coupon_counted := true;
  ELSIF (NOT _should) AND COALESCE(NEW.coupon_counted, false) THEN
    UPDATE public.coupons SET uses_count = GREATEST(COALESCE(uses_count, 0) - 1, 0) WHERE id = _cid;
    NEW.coupon_counted := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_coupon_usage_ins ON public.orders;
CREATE TRIGGER trg_orders_coupon_usage_ins
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_orders_coupon_usage();

DROP TRIGGER IF EXISTS trg_orders_coupon_usage_upd ON public.orders;
CREATE TRIGGER trg_orders_coupon_usage_upd
BEFORE UPDATE OF status, coupon_code ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_orders_coupon_usage();

-- Backfill
UPDATE public.orders o
SET coupon_counted = (o.status NOT IN ('pending'::order_status, 'cancelled'::order_status))
WHERE o.coupon_code IS NOT NULL AND o.external_source IS NULL;

UPDATE public.coupons c
SET uses_count = COALESCE(sub.cnt, 0)
FROM (
  SELECT c2.id, (
    SELECT count(*) FROM public.orders o
    WHERE o.restaurant_id = c2.restaurant_id
      AND o.external_source IS NULL
      AND o.coupon_code IS NOT NULL
      AND upper(o.coupon_code) = upper(c2.code)
      AND o.status NOT IN ('pending'::order_status, 'cancelled'::order_status)
  ) AS cnt
  FROM public.coupons c2
) sub
WHERE c.id = sub.id;