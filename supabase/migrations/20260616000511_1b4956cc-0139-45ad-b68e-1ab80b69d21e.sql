
-- Make access_groups global (shared across all restaurants).
-- Only master_admin can create/edit/delete groups; all authenticated users can read them.

ALTER TABLE public.access_groups ALTER COLUMN restaurant_id DROP NOT NULL;

-- Promote Petrolândia's groups to global (restaurant_id = NULL).
-- Members already point to these IDs, so assignments are preserved.
UPDATE public.access_groups
   SET restaurant_id = NULL
 WHERE restaurant_id = '72b1c6f8-85d6-414a-bc5f-5921d09438e8';

-- Remove any other per-restaurant groups (no members reference them).
DELETE FROM public.access_groups WHERE restaurant_id IS NOT NULL;

-- Replace RLS policies
DROP POLICY IF EXISTS "Manager manages access groups" ON public.access_groups;

CREATE POLICY "Anyone authenticated can read access groups"
  ON public.access_groups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Master admin manages access groups"
  ON public.access_groups FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'::app_role));
