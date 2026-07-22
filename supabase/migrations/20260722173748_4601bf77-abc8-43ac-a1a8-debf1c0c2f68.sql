
CREATE TABLE public.mystery_shopper_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.mystery_shopper_assignments(id) ON DELETE CASCADE,
  result_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  visit_date date,
  ratings jsonb,
  comments text,
  total_score numeric,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mystery_responses_assignment ON public.mystery_shopper_responses(assignment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mystery_shopper_responses TO authenticated;
GRANT ALL ON public.mystery_shopper_responses TO service_role;

ALTER TABLE public.mystery_shopper_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage mystery responses"
  ON public.mystery_shopper_responses FOR ALL
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));

-- Backfill existing submitted assignments as responses
INSERT INTO public.mystery_shopper_responses (assignment_id, result_token, visit_date, ratings, comments, total_score, submitted_at, created_at)
SELECT id, result_token, visit_date, ratings, comments, total_score, submitted_at, submitted_at
FROM public.mystery_shopper_assignments
WHERE submitted_at IS NOT NULL;

-- Update get_form to always allow submitting (multi-response)
CREATE OR REPLACE FUNCTION public.mystery_get_form(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      'visit_date', _a.visit_date
    ),
    'config', COALESCE(_cfg, '[]'::jsonb)
  );
END;
$function$;

-- Submit now always creates a new response row
CREATE OR REPLACE FUNCTION public.mystery_submit_form(_token text, _visit_date date, _ratings jsonb, _comments text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _a record;
  _cfg jsonb;
  _score numeric;
  _rid uuid;
  _rtoken text;
BEGIN
  SELECT * INTO _a FROM public.mystery_shopper_assignments WHERE form_token = _token;
  IF _a IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;
  SELECT categories INTO _cfg FROM public.mystery_shopper_config ORDER BY updated_at DESC LIMIT 1;
  _score := public.mystery_calculate_score(COALESCE(_cfg,'[]'::jsonb), _ratings);
  INSERT INTO public.mystery_shopper_responses (assignment_id, visit_date, ratings, comments, total_score)
    VALUES (_a.id, _visit_date, _ratings, _comments, _score)
    RETURNING id, result_token INTO _rid, _rtoken;
  RETURN jsonb_build_object('result_token', _rtoken, 'total_score', _score);
END;
$function$;

-- Result reads from responses
CREATE OR REPLACE FUNCTION public.mystery_get_result(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r record;
  _a record;
  _cfg jsonb;
  _rest_name text;
  _shopper_name text;
BEGIN
  SELECT * INTO _r FROM public.mystery_shopper_responses WHERE result_token = _token;
  IF _r IS NULL THEN
    -- fallback to legacy assignment result token
    SELECT * INTO _a FROM public.mystery_shopper_assignments WHERE result_token = _token AND submitted_at IS NOT NULL;
    IF _a IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;
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
  END IF;
  SELECT * INTO _a FROM public.mystery_shopper_assignments WHERE id = _r.assignment_id;
  SELECT categories INTO _cfg FROM public.mystery_shopper_config ORDER BY updated_at DESC LIMIT 1;
  SELECT name INTO _rest_name FROM public.restaurants WHERE id = _a.restaurant_id;
  SELECT name INTO _shopper_name FROM public.mystery_shoppers WHERE id = _a.shopper_id;
  RETURN jsonb_build_object(
    'restaurant_name', _rest_name,
    'shopper_name', _shopper_name,
    'visit_date', _r.visit_date,
    'comments', _r.comments,
    'ratings', _r.ratings,
    'total_score', _r.total_score,
    'submitted_at', _r.submitted_at,
    'config', COALESCE(_cfg, '[]'::jsonb)
  );
END;
$function$;
