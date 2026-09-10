-- Revoga execução pública/logada de funções internas
DO $$
DECLARE
  fn record;
  internal text[] := ARRAY[
    'apply_stock_delta','apply_admin_stock_delta','debit_external_order_stock','recompute_order_stock',
    'quero_poll_burst','match_product_by_name','assign_order_number','log_order_status_change',
    'enqueue_evolution_message_for_order','handle_new_user','handle_order_item_option_stock',
    'handle_order_item_stock','handle_order_stock','handle_supply_order_delivered',
    'on_restaurant_created_loyalty','tg_external_order_delivered_stock','tg_normalize_phone',
    'tg_orders_attach_cash_session','tg_orders_coupon_usage','touch_updated_at'
  ];
  authed_only text[] := ARRAY[
    'close_cash_session','reopen_cash_session','redeem_loyalty_points','create_loyalty_redeem_code',
    'verify_loyalty_redeem_code','credit_loyalty_points'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
  LOOP
    IF fn.proname = ANY(internal) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', fn.sig);
    ELSIF fn.proname = ANY(authed_only) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    END IF;
  END LOOP;
END $$;