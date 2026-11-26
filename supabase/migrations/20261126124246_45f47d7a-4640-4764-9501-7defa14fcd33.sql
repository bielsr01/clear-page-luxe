ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_apply_to_check;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_apply_to_check CHECK (apply_to IN ('order','items','exclude'));