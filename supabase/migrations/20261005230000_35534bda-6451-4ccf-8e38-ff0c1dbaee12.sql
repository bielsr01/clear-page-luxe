-- Preço "de" (original) para produtos em promoção no cardápio.
-- `price` continua sendo o valor cobrado (o preço com desconto); `original_price`
-- só é exibido riscado quando for maior que `price`.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2);
