
DELETE FROM public.user_roles
WHERE user_id IN (
  'e69cbce5-5a88-4dd8-be8a-c03b1ff0f1cd',
  'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e',
  '5e8761b9-66d8-4a7d-a943-cda04935b3c7'
);

INSERT INTO public.user_roles (user_id, role) VALUES
  ('e69cbce5-5a88-4dd8-be8a-c03b1ff0f1cd', 'master_admin'),
  ('d9ae31bb-1267-496b-a8ef-59a3fb1fca2e', 'master_admin'),
  ('5e8761b9-66d8-4a7d-a943-cda04935b3c7', 'master_admin');
