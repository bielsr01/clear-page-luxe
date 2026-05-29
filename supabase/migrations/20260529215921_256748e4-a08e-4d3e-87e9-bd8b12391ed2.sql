-- Add new columns to loyalty_settings
ALTER TABLE public.loyalty_settings 
ADD COLUMN IF NOT EXISTS loyalty_description TEXT DEFAULT 'Acumule pontos em todas as suas compras e troque por benefícios exclusivos. Quanto mais você consome, mais vantagens recebe.',
ADD COLUMN IF NOT EXISTS loyalty_rules TEXT DEFAULT '• A cada R$ 1,00 gasto equivale a 1 ponto.
• Os pontos só podem ser utilizados na mesma unidade onde foram acumulados.
• Os pontos só podem ser resgatados presencialmente na loja.';

-- Update existing records with default values if they are null
UPDATE public.loyalty_settings 
SET loyalty_description = 'Acumule pontos em todas as suas compras e troque por benefícios exclusivos. Quanto mais você consome, mais vantagens recebe.'
WHERE loyalty_description IS NULL;

UPDATE public.loyalty_settings 
SET loyalty_rules = '• A cada R$ 1,00 gasto equivale a 1 ponto.
• Os pontos só podem ser utilizados na mesma unidade onde foram acumulados.
• Os pontos só podem ser resgatados presencialmente na loja.'
WHERE loyalty_rules IS NULL;

-- Make reward_id nullable in loyalty_redeem_codes to allow consultation codes
ALTER TABLE public.loyalty_redeem_codes ALTER COLUMN reward_id DROP NOT NULL;

-- Create function to create a consultation code
CREATE OR REPLACE FUNCTION public.create_loyalty_consultation_code(_restaurant_id UUID, _phone TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _code TEXT;
  _id UUID;
  _member_id UUID;
BEGIN
  -- Check if member exists
  SELECT id INTO _member_id FROM public.loyalty_members 
  WHERE restaurant_id = _restaurant_id AND phone = _phone;
  
  IF _member_id IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado para este restaurante.';
  END IF;

  -- Generate 6 digit code
  _code := floor(random() * 900000 + 100000)::text;
  
  INSERT INTO public.loyalty_redeem_codes (restaurant_id, member_id, phone, code, expires_at)
  VALUES (_restaurant_id, _member_id, _phone, _code, now() + interval '10 minutes')
  RETURNING id INTO _id;
  
  RETURN _id;
END;
$$;

-- Create function to verify consultation code
CREATE OR REPLACE FUNCTION public.verify_loyalty_consultation_code(_code_id UUID, _code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _row public.loyalty_redeem_codes;
  _member public.loyalty_members;
BEGIN
  SELECT * INTO _row FROM public.loyalty_redeem_codes WHERE id = _code_id;
  
  IF _row IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Código não encontrado');
  END IF;
  
  IF _row.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Código já utilizado');
  END IF;
  
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
  
  -- Get member details
  SELECT * INTO _member FROM public.loyalty_members WHERE id = _row.member_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'member', jsonb_build_object(
      'id', _member.id,
      'name', _member.name,
      'phone', _member.phone,
      'points', _member.points
    )
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_loyalty_consultation_code(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_loyalty_consultation_code(UUID, TEXT) TO anon, authenticated;
