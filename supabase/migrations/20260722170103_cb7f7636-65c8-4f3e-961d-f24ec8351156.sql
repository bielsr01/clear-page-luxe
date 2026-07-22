
-- Shoppers
CREATE TABLE public.mystery_shoppers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text,
  phone text,
  cpf text,
  pix_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mystery_shoppers TO authenticated;
GRANT ALL ON public.mystery_shoppers TO service_role;
ALTER TABLE public.mystery_shoppers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage shoppers" ON public.mystery_shoppers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));
CREATE TRIGGER trg_mystery_shoppers_updated BEFORE UPDATE ON public.mystery_shoppers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Config (singleton)
CREATE TABLE public.mystery_shopper_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mystery_shopper_config TO authenticated;
GRANT ALL ON public.mystery_shopper_config TO service_role;
ALTER TABLE public.mystery_shopper_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage config" ON public.mystery_shopper_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));
CREATE TRIGGER trg_mystery_config_updated BEFORE UPDATE ON public.mystery_shopper_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.mystery_shopper_config (categories) VALUES ($$[
  {"key":"atendimento","name":"Atendimento","weight":4,"questions":[
    {"key":"educacao","label":"Educação dos funcionários (cordialidade)?"},
    {"key":"espera","label":"Esperou muito?"},
    {"key":"atendente_educado","label":"Atendente foi educado?"}
  ]},
  {"key":"produto","name":"Produto","weight":3,"questions":[
    {"key":"quente","label":"Produto estava quente?"},
    {"key":"saboroso","label":"Produto estava saboroso?"},
    {"key":"fresco","label":"Produto estava fresco?"}
  ]},
  {"key":"ambiente","name":"Ambiente","weight":2,"questions":[
    {"key":"loja_limpa","label":"A loja estava limpa?"},
    {"key":"banheiro_limpo","label":"O banheiro estava limpo?"},
    {"key":"confortavel","label":"O ambiente estava confortável?"},
    {"key":"mesas_limpas","label":"As mesas estavam limpas?"}
  ]},
  {"key":"padrao_marca","name":"Padrão da marca","weight":1,"questions":[
    {"key":"uniforme","label":"O funcionário estava uniformizado?"},
    {"key":"divulgacao","label":"A loja tinha materiais de divulgação?"},
    {"key":"preco_correto","label":"O preço estava correto?"}
  ]}
]$$::jsonb);

-- Assignments
CREATE TABLE public.mystery_shopper_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopper_id uuid REFERENCES public.mystery_shoppers(id) ON DELETE SET NULL,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  form_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  result_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  visit_date date,
  ratings jsonb,
  comments text,
  total_score numeric,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mystery_shopper_assignments TO authenticated;
GRANT ALL ON public.mystery_shopper_assignments TO service_role;
ALTER TABLE public.mystery_shopper_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage assignments" ON public.mystery_shopper_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));
CREATE TRIGGER trg_mystery_assignments_updated BEFORE UPDATE ON public.mystery_shopper_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_mystery_assignments_restaurant ON public.mystery_shopper_assignments(restaurant_id);
CREATE INDEX idx_mystery_assignments_shopper ON public.mystery_shopper_assignments(shopper_id);

-- Score calculator
CREATE OR REPLACE FUNCTION public.mystery_calculate_score(_categories jsonb, _ratings jsonb)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _cat jsonb;
  _q jsonb;
  _sum numeric;
  _cnt int;
  _cat_pct numeric;
  _weight numeric;
  _total_weighted numeric := 0;
  _total_weight numeric := 0;
  _val numeric;
BEGIN
  IF _ratings IS NULL OR _categories IS NULL THEN RETURN NULL; END IF;
  FOR _cat IN SELECT * FROM jsonb_array_elements(_categories) LOOP
    _sum := 0; _cnt := 0;
    FOR _q IN SELECT * FROM jsonb_array_elements(_cat->'questions') LOOP
      _val := ((_ratings->(_cat->>'key'))->>(_q->>'key'))::numeric;
      IF _val IS NOT NULL THEN
        _sum := _sum + _val;
        _cnt := _cnt + 1;
      END IF;
    END LOOP;
    IF _cnt > 0 THEN
      _cat_pct := (_sum / _cnt) / 5.0 * 100.0;
      _weight := COALESCE((_cat->>'weight')::numeric, 0);
      _total_weighted := _total_weighted + _cat_pct * _weight;
      _total_weight := _total_weight + _weight;
    END IF;
  END LOOP;
  IF _total_weight = 0 THEN RETURN NULL; END IF;
  RETURN round(_total_weighted / _total_weight, 2);
END;
$$;

-- Public RPCs
CREATE OR REPLACE FUNCTION public.mystery_get_form(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _a record;
  _cfg jsonb;
  _rest_name text;
  _shopper_name text;
BEGIN
  SELECT * INTO _a FROM public.mystery_shopper_assignments WHERE form_token = _token;
  IF _a IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;
  SELECT categories INTO _cfg FROM public.mystery_shopper_config ORDER BY updated_at DESC LIMIT 1;
  SELECT name INTO _rest_name FROM public.restaurants WHERE id = _a.restaurant_id;
  SELECT name INTO _shopper_name FROM public.mystery_shoppers WHERE id = _a.shopper_id;
  RETURN jsonb_build_object(
    'assignment', jsonb_build_object(
      'id', _a.id,
      'restaurant_name', _rest_name,
      'shopper_name', _shopper_name,
      'visit_date', _a.visit_date,
      'submitted_at', _a.submitted_at,
      'result_token', CASE WHEN _a.submitted_at IS NOT NULL THEN _a.result_token ELSE NULL END
    ),
    'config', COALESCE(_cfg, '[]'::jsonb)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.mystery_get_form(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mystery_submit_form(_token text, _visit_date date, _ratings jsonb, _comments text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _a record;
  _cfg jsonb;
  _score numeric;
BEGIN
  SELECT * INTO _a FROM public.mystery_shopper_assignments WHERE form_token = _token FOR UPDATE;
  IF _a IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;
  IF _a.submitted_at IS NOT NULL THEN
    RETURN jsonb_build_object('error','already_submitted');
  END IF;
  SELECT categories INTO _cfg FROM public.mystery_shopper_config ORDER BY updated_at DESC LIMIT 1;
  _score := public.mystery_calculate_score(COALESCE(_cfg,'[]'::jsonb), _ratings);
  UPDATE public.mystery_shopper_assignments
    SET visit_date = _visit_date,
        ratings = _ratings,
        comments = _comments,
        total_score = _score,
        submitted_at = now()
    WHERE id = _a.id;
  RETURN jsonb_build_object('result_token', _a.result_token, 'total_score', _score);
END;
$$;
GRANT EXECUTE ON FUNCTION public.mystery_submit_form(text, date, jsonb, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mystery_get_result(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _a record;
  _cfg jsonb;
  _rest_name text;
  _shopper_name text;
BEGIN
  SELECT * INTO _a FROM public.mystery_shopper_assignments WHERE result_token = _token;
  IF _a IS NULL OR _a.submitted_at IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;
  SELECT categories INTO _cfg FROM public.mystery_shopper_config ORDER BY updated_at DESC LIMIT 1;
  SELECT name INTO _rest_name FROM public.restaurants WHERE id = _a.restaurant_id;
  SELECT name INTO _shopper_name FROM public.mystery_shoppers WHERE id = _a.shopper_id;
  RETURN jsonb_build_object(
    'restaurant_name', _rest_name,
    'shopper_name', _shopper_name,
    'visit_date', _a.visit_date,
    'comments', _a.comments,
    'ratings', _a.ratings,
    'total_score', _a.total_score,
    'submitted_at', _a.submitted_at,
    'config', COALESCE(_cfg, '[]'::jsonb)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.mystery_get_result(text) TO anon, authenticated;
