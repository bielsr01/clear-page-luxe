-- Function to create default loyalty settings
CREATE OR REPLACE FUNCTION public.on_restaurant_created_loyalty()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.loyalty_settings (restaurant_id, enabled, points_per_real)
  VALUES (NEW.id, false, 1)
  ON CONFLICT (restaurant_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on restaurants table
CREATE TRIGGER tr_restaurant_created_loyalty
AFTER INSERT ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.on_restaurant_created_loyalty();

-- Ensure all existing restaurants have loyalty settings
INSERT INTO public.loyalty_settings (restaurant_id, enabled, points_per_real)
SELECT id, false, 1 FROM public.restaurants
ON CONFLICT (restaurant_id) DO NOTHING;
