-- Grant permissions to loyalty tables
GRANT SELECT ON public.loyalty_settings TO anon, authenticated;
GRANT ALL ON public.loyalty_settings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_members TO authenticated;
GRANT ALL ON public.loyalty_members TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_transactions TO authenticated;
GRANT ALL ON public.loyalty_transactions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_rewards TO authenticated;
GRANT SELECT ON public.loyalty_rewards TO anon;
GRANT ALL ON public.loyalty_rewards TO service_role;

-- Ensure RLS policies exist
-- Loyalty Settings
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loyalty_settings' AND policyname = 'Allow public read access to loyalty settings') THEN
    CREATE POLICY "Allow public read access to loyalty settings" ON public.loyalty_settings FOR SELECT USING (true);
  END IF;
END $$;

-- Loyalty Rewards (public can see rewards)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loyalty_rewards' AND policyname = 'Allow public read access to loyalty rewards') THEN
    CREATE POLICY "Allow public read access to loyalty rewards" ON public.loyalty_rewards FOR SELECT USING (true);
  END IF;
END $$;

-- Loyalty Members (Managers can view their own restaurant members)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loyalty_members' AND policyname = 'Managers can manage their own restaurant members') THEN
    CREATE POLICY "Managers can manage their own restaurant members" ON public.loyalty_members
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.restaurants r
        WHERE r.id = restaurant_id AND r.owner_id = auth.uid()
      )
    );
  END IF;
END $$;

-- Loyalty Transactions (Managers can view their own restaurant transactions)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'loyalty_transactions' AND policyname = 'Managers can manage their own restaurant transactions') THEN
    CREATE POLICY "Managers can manage their own restaurant transactions" ON public.loyalty_transactions
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.restaurants r
        WHERE r.id = restaurant_id AND r.owner_id = auth.uid()
      )
    );
  END IF;
END $$;
