CREATE OR REPLACE FUNCTION public.match_product_by_name(_restaurant_id uuid, _name text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _norm text := public.normalize_product_name(_name);
  _pid uuid;
  _count int;
BEGIN
  IF _norm = '' THEN RETURN NULL; END IF;

  -- Strict: exact normalized match only (case/acentos/espaços/pontuação ignorados)
  SELECT id INTO _pid
    FROM public.products
   WHERE restaurant_id = _restaurant_id
     AND is_active = true
     AND public.normalize_product_name(name) = _norm
   LIMIT 1;

  IF _pid IS NOT NULL THEN RETURN _pid; END IF;

  -- Sem match exato: NÃO usar substring para evitar associar
  -- "Combo Maravilha" a "Combo" ou vice-versa. Retorna NULL e
  -- o log marca como no_product_match.
  RETURN NULL;
END;
$function$;