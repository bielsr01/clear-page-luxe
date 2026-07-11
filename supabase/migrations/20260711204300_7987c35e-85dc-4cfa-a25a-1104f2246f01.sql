
CREATE POLICY "admin read audit photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'audit-photos' AND public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "admin upload audit photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audit-photos' AND public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "admin update audit photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'audit-photos' AND public.has_role(auth.uid(), 'master_admin'::app_role));

CREATE POLICY "admin delete audit photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'audit-photos' AND public.has_role(auth.uid(), 'master_admin'::app_role));
