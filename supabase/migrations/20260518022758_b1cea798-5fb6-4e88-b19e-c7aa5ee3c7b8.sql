
DO $$
DECLARE
  map_sql text := $m$
    CASE user_col
      WHEN '11233a04-5535-48e8-9ce8-fafb8c074220'::uuid THEN 'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e'::uuid
      WHEN 'f6c21d9b-18d4-4531-ada4-55d9fcead649'::uuid THEN 'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e'::uuid
      WHEN '93bd7849-4eb7-43a8-82fa-aa6cd9541985'::uuid THEN '5e8761b9-66d8-4a7d-a943-cda04935b3c7'::uuid
    END
  $m$;
BEGIN
  NULL;
END $$;

UPDATE restaurants SET owner_id = CASE owner_id
  WHEN '11233a04-5535-48e8-9ce8-fafb8c074220'::uuid THEN 'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e'::uuid
  WHEN 'f6c21d9b-18d4-4531-ada4-55d9fcead649'::uuid THEN 'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e'::uuid
  WHEN '93bd7849-4eb7-43a8-82fa-aa6cd9541985'::uuid THEN '5e8761b9-66d8-4a7d-a943-cda04935b3c7'::uuid
END
WHERE owner_id IN ('11233a04-5535-48e8-9ce8-fafb8c074220','f6c21d9b-18d4-4531-ada4-55d9fcead649','93bd7849-4eb7-43a8-82fa-aa6cd9541985');

UPDATE expenses SET created_by = CASE created_by
  WHEN '11233a04-5535-48e8-9ce8-fafb8c074220'::uuid THEN 'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e'::uuid
  WHEN 'f6c21d9b-18d4-4531-ada4-55d9fcead649'::uuid THEN 'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e'::uuid
  WHEN '93bd7849-4eb7-43a8-82fa-aa6cd9541985'::uuid THEN '5e8761b9-66d8-4a7d-a943-cda04935b3c7'::uuid
END
WHERE created_by IN ('11233a04-5535-48e8-9ce8-fafb8c074220','f6c21d9b-18d4-4531-ada4-55d9fcead649','93bd7849-4eb7-43a8-82fa-aa6cd9541985');

UPDATE admin_stock_movements SET created_by = CASE created_by
  WHEN '11233a04-5535-48e8-9ce8-fafb8c074220'::uuid THEN 'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e'::uuid
  WHEN 'f6c21d9b-18d4-4531-ada4-55d9fcead649'::uuid THEN 'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e'::uuid
  WHEN '93bd7849-4eb7-43a8-82fa-aa6cd9541985'::uuid THEN '5e8761b9-66d8-4a7d-a943-cda04935b3c7'::uuid
END
WHERE created_by IN ('11233a04-5535-48e8-9ce8-fafb8c074220','f6c21d9b-18d4-4531-ada4-55d9fcead649','93bd7849-4eb7-43a8-82fa-aa6cd9541985');

UPDATE cash_movements SET created_by = CASE created_by
  WHEN '11233a04-5535-48e8-9ce8-fafb8c074220'::uuid THEN 'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e'::uuid
  WHEN 'f6c21d9b-18d4-4531-ada4-55d9fcead649'::uuid THEN 'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e'::uuid
  WHEN '93bd7849-4eb7-43a8-82fa-aa6cd9541985'::uuid THEN '5e8761b9-66d8-4a7d-a943-cda04935b3c7'::uuid
END
WHERE created_by IN ('11233a04-5535-48e8-9ce8-fafb8c074220','f6c21d9b-18d4-4531-ada4-55d9fcead649','93bd7849-4eb7-43a8-82fa-aa6cd9541985');

UPDATE cash_register_sessions SET opened_by = CASE opened_by
  WHEN '11233a04-5535-48e8-9ce8-fafb8c074220'::uuid THEN 'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e'::uuid
  WHEN 'f6c21d9b-18d4-4531-ada4-55d9fcead649'::uuid THEN 'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e'::uuid
  WHEN '93bd7849-4eb7-43a8-82fa-aa6cd9541985'::uuid THEN '5e8761b9-66d8-4a7d-a943-cda04935b3c7'::uuid
END
WHERE opened_by IN ('11233a04-5535-48e8-9ce8-fafb8c074220','f6c21d9b-18d4-4531-ada4-55d9fcead649','93bd7849-4eb7-43a8-82fa-aa6cd9541985');

UPDATE cash_register_sessions SET closed_by = CASE closed_by
  WHEN '11233a04-5535-48e8-9ce8-fafb8c074220'::uuid THEN 'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e'::uuid
  WHEN 'f6c21d9b-18d4-4531-ada4-55d9fcead649'::uuid THEN 'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e'::uuid
  WHEN '93bd7849-4eb7-43a8-82fa-aa6cd9541985'::uuid THEN '5e8761b9-66d8-4a7d-a943-cda04935b3c7'::uuid
END
WHERE closed_by IN ('11233a04-5535-48e8-9ce8-fafb8c074220','f6c21d9b-18d4-4531-ada4-55d9fcead649','93bd7849-4eb7-43a8-82fa-aa6cd9541985');

UPDATE operator_logs SET actor_id = CASE actor_id
  WHEN '11233a04-5535-48e8-9ce8-fafb8c074220'::uuid THEN 'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e'::uuid
  WHEN 'f6c21d9b-18d4-4531-ada4-55d9fcead649'::uuid THEN 'd9ae31bb-1267-496b-a8ef-59a3fb1fca2e'::uuid
  WHEN '93bd7849-4eb7-43a8-82fa-aa6cd9541985'::uuid THEN '5e8761b9-66d8-4a7d-a943-cda04935b3c7'::uuid
END
WHERE actor_id IN ('11233a04-5535-48e8-9ce8-fafb8c074220','f6c21d9b-18d4-4531-ada4-55d9fcead649','93bd7849-4eb7-43a8-82fa-aa6cd9541985');
