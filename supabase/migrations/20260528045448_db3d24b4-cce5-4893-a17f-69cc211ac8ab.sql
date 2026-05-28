
CREATE TABLE public.loyalty_redeem_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  member_id uuid NOT NULL,
  reward_id uuid NOT NULL,
  code text NOT NULL,
  phone text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used_at timestamptz
);

CREATE INDEX idx_loyalty_redeem_codes_lookup
  ON public.loyalty_redeem_codes (restaurant_id, member_id, reward_id, used_at);

GRANT SELECT, INSERT, UPDATE ON public.loyalty_redeem_codes TO authenticated;
GRANT ALL ON public.loyalty_redeem_codes TO service_role;

ALTER TABLE public.loyalty_redeem_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager manages redeem codes"
  ON public.loyalty_redeem_codes FOR ALL
  TO authenticated
  USING (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.is_restaurant_manager(auth.uid(), restaurant_id) OR public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE OR REPLACE FUNCTION public.create_loyalty_redeem_code(
  _restaurant_id uuid, _member_id uuid, _reward_id uuid
) RETURNS TABLE(id uuid, code text, phone text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _phone text;
  _code text;
  _id uuid;
BEGIN
  IF NOT (public.is_restaurant_manager(auth.uid(), _restaurant_id) OR public.has_role(auth.uid(), 'master_admin'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT m.phone INTO _phone FROM public.loyalty_members m
    WHERE m.id = _member_id AND m.restaurant_id = _restaurant_id;
  IF _phone IS NULL OR length(regexp_replace(_phone, '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'Cliente sem telefone válido';
  END IF;

  -- Invalida códigos anteriores não usados do mesmo trio
  UPDATE public.loyalty_redeem_codes
    SET used_at = now()
    WHERE restaurant_id = _restaurant_id
      AND member_id = _member_id
      AND reward_id = _reward_id
      AND used_at IS NULL;

  _code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  INSERT INTO public.loyalty_redeem_codes (restaurant_id, member_id, reward_id, code, phone)
    VALUES (_restaurant_id, _member_id, _reward_id, _code, _phone)
    RETURNING loyalty_redeem_codes.id INTO _id;

  RETURN QUERY SELECT _id, _code, _phone;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_loyalty_redeem_code(
  _code_id uuid, _code text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row record;
BEGIN
  SELECT * INTO _row FROM public.loyalty_redeem_codes WHERE id = _code_id FOR UPDATE;
  IF _row IS NULL THEN RETURN false; END IF;

  IF NOT (public.is_restaurant_manager(auth.uid(), _row.restaurant_id) OR public.has_role(auth.uid(), 'master_admin'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF _row.used_at IS NOT NULL THEN RETURN false; END IF;
  IF _row.expires_at < now() THEN RETURN false; END IF;
  IF _row.attempts >= 5 THEN RETURN false; END IF;

  UPDATE public.loyalty_redeem_codes
    SET attempts = attempts + 1
    WHERE id = _code_id;

  IF _row.code = _code THEN
    UPDATE public.loyalty_redeem_codes SET used_at = now() WHERE id = _code_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
