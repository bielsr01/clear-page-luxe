
REVOKE ALL ON FUNCTION public.close_cash_session(uuid, numeric, numeric, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_cash_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_orders_attach_cash_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, numeric, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_cash_session(uuid) TO authenticated;
