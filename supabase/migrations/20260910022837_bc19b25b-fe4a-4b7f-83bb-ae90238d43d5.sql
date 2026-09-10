DROP POLICY IF EXISTS "Access groups readable by restaurant team" ON public.access_groups;
CREATE POLICY "Access groups readable by restaurant team"
ON public.access_groups FOR SELECT TO authenticated
USING (
  restaurant_id IS NULL
  OR public.is_restaurant_manager(auth.uid(), restaurant_id)
  OR public.has_role(auth.uid(), 'master_admin'::app_role)
);

CREATE OR REPLACE FUNCTION public.get_restaurant_member_emails(_restaurant_id uuid)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_restaurant_manager(auth.uid(), _restaurant_id) OR public.has_role(auth.uid(), 'master_admin'::app_role)) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text
  FROM auth.users u
  WHERE u.id IN (
    SELECT m.user_id FROM public.restaurant_members m WHERE m.restaurant_id = _restaurant_id
    UNION
    SELECT r.owner_id FROM public.restaurants r WHERE r.id = _restaurant_id AND r.owner_id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_restaurant_member_emails(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_restaurant_member_emails(uuid) TO authenticated, service_role;