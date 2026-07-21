
CREATE TABLE public.promo_calendar_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_date date NOT NULL,
  message text NOT NULL DEFAULT '',
  reminder_days_before integer,
  is_recurring boolean NOT NULL DEFAULT true,
  dismissed_for_year integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_calendar_dates TO authenticated;
GRANT ALL ON public.promo_calendar_dates TO service_role;

ALTER TABLE public.promo_calendar_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master admins manage promo calendar"
  ON public.promo_calendar_dates
  FOR ALL
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE TRIGGER promo_calendar_dates_touch_updated_at
  BEFORE UPDATE ON public.promo_calendar_dates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX promo_calendar_dates_restaurant_idx ON public.promo_calendar_dates(restaurant_id);
CREATE INDEX promo_calendar_dates_event_date_idx ON public.promo_calendar_dates(event_date);

ALTER PUBLICATION supabase_realtime ADD TABLE public.promo_calendar_dates;
