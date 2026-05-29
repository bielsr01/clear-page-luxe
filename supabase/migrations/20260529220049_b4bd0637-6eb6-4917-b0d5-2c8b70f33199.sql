CREATE OR REPLACE FUNCTION public.verify_loyalty_consultation_code(_code_id UUID, _code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _row public.loyalty_redeem_codes;
  _member public.loyalty_members;
  _history JSONB;
BEGIN
  SELECT * INTO _row FROM public.loyalty_redeem_codes WHERE id = _code_id;
  
  IF _row IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Código não encontrado');
  END IF;
  
  IF _row.used_at IS NOT NULL THEN
    -- Check if it was used very recently (allow refresh/retry within 5 mins of same session)
    IF _row.used_at < now() - interval '5 minutes' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Código já utilizado');
    END IF;
  ELSE
    -- Normal validation
    IF _row.expires_at < now() THEN
      RETURN jsonb_build_object('success', false, 'error', 'Código expirado');
    END IF;
    
    IF _row.attempts >= 5 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Muitas tentativas');
    END IF;
    
    IF _row.code != _code THEN
      UPDATE public.loyalty_redeem_codes SET attempts = attempts + 1 WHERE id = _code_id;
      RETURN jsonb_build_object('success', false, 'error', 'Código inválido');
    END IF;
    
    -- Mark as used
    UPDATE public.loyalty_redeem_codes SET used_at = now() WHERE id = _code_id;
  END IF;
  
  -- Get member details
  SELECT * INTO _member FROM public.loyalty_members WHERE id = _row.member_id;
  
  -- Get history (credited transactions and redeemed)
  -- We include order number if available
  SELECT jsonb_agg(h) INTO _history FROM (
    SELECT 
      lt.id,
      lt.points,
      lt.type,
      lt.status,
      lt.created_at,
      lt.credited_at,
      o.order_number,
      -- Calculate balance after this transaction (simplified)
      SUM(lt.points) OVER (ORDER BY lt.created_at ASC) as balance_after
    FROM public.loyalty_transactions lt
    LEFT JOIN public.orders o ON o.id = lt.order_id
    WHERE lt.member_id = _member.id AND (lt.status = 'credited' OR lt.type = 'redeem')
    ORDER BY lt.created_at DESC
  ) h;
  
  RETURN jsonb_build_object(
    'success', true,
    'member', jsonb_build_object(
      'id', _member.id,
      'name', _member.name,
      'phone', _member.phone,
      'points', _member.points
    ),
    'history', COALESCE(_history, '[]'::jsonb)
  );
END;
$$;
